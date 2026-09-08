---
type: Playbook
title: Activate a server module without assuming a Host restart
description: 先检查产物和目标 Host，再用官方隔离 HMR 受控替换；缺少证据保持未确定，不自动重启。
tags: [server, module, restart, hmr]
aliases: [server plugin, server module, restart host, 服务端插件, module HMR]
status: stable
verified_against: { tag: dsh-v0.1.2-rc.1, date: 2026-09-06 }
sources:
  - id: web-bundle
    resource: packages/bundle/web-app/cordis.patch.yml
    title: Shared module HMR disabled in Web
  - id: cordis-hmr
    resource: vendor/hmr/src/index.ts
    title: Conditional module HMR implementation
---

# 步骤

1. 构建并检查 server 产物。多文件实现须在 `dshx.yml` 的 `hotReload.artifacts` 声明精确的包内相对文件清单，包含运行入口与要更新的服务端 helper；最多 32 个 JS/TS 文件，禁止目录、glob、外链和依赖目录。需要同步时运行 `sync-artifact`；同步不证明激活。
2. 用 `status` 确认唯一目标 Host 的 Home、profile、port、PID，再读 `activation-plan <plugin> --change server`。`not-decided` 是待取得运行时证据，不是重启指令。
3. 普通 root 插件在外部运行 `dshx hot-reload <plugin-id> --profile web --port <当前端口>`，或在 Creator+ 使用固定的 `dshx_hot_reload`。命令检查目标与已生效的官方 HMR 实例，临时挂载精确文件集合的隔离 HMR，等待 READY 后批量触发，并清理临时资源；不持续监听半成品，不调用进程重启。所有声明文件的前后哈希必须相等。
4. 只有同 PID、新模块代际和临时资源清理均有证据，才能报告 `HOST_MODULE_RELOADED`。随后在当前认证 WebUI 实测功能；客户端部分另按 client 分支验证。
5. 失败或身份未知时保留源码和错误证据。不要把失败自动转成重启；只有另有具体的启动边界或故障恢复证据，并获得相应授权，才选择原启动器的重启路径。

# 证据边界

默认 `root` 接受活动 watched patch 中的精确 root 行，也接受已注册 bundle 在包内 patch 声明的唯一同名包行。磁盘配置只提供候选；Host 内 observer 仍必须证明实际行 id、模块 URL、运行代际和完整 fiber 范围。多行歧义、越界 patch 或范围外实例都拒绝，不会因磁盘 bundle 注册就宣称已激活。

对 Creator+ 等纯 preset-private 模块，外部 supervisor 可显式使用 `--scope preset`。该模式验证 profile 包链接、唯一运行模块以及没有 root 混挂，再临时加入不会挂载 fiber 的 disabled discovery 行，让官方 HMR 找到模块。它替换这个模块的全部已挂载 preset fibers，不能冒充只更新某个会话，也不强行 recompose 已开始的会话。Creator+ 的固定工具不能使用此 scope，不能热替换正在执行它的 Creator+/DSHX 自身。

未声明文件清单时只处理入口及已验证的 package runtime entry，不自动扫描或猜测依赖闭包。真实实验发现，只换入口可能留下旧 helper；即使 `HOST_MODULE_RELOADED` 已证明，仍须实测用到 helper 的功能。多文件源码不要沿用入口单文件的验收结果。记录只证明本次有界替换，不承诺自动恢复任意插件副作用；HMR journal 的 `automaticRecovery` 当前为 `false`。

RC1 的默认 `root: []` 仅保证配置监听。专项验收已证明，可以运行中挂载隔离的官方 HMR，热换链接到外部目录的插件，再撤掉 HMR，而原配置 watcher 继续工作。此机制不保证任意插件的业务逻辑或框架外副作用正确；实际目标仍须通过命令门禁和功能验收。旧文件名保留供已有知识链接使用，不表示重启是默认流程。
