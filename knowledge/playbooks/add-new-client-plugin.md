---
type: Playbook
title: Activate a newly added client plugin
description: RC2 可同 PID 热挂 Host 行，并由 client HMR 同步到当前页面；Host 与页面行为分别验证。
tags: [client, graph, reload, activation]
aliases: [new client, client reload, 新客户端插件, 页面刷新, new graph entry]
status: stable
verified_against: { tag: dsh-v0.2.0-rc.2, sha: 639ed015397290b3745d163aafe02ffee4aa3f84 }
sources:
  - id: web-boot
    resource: packages/client/web/src/boot.ts
    title: One-time page loader tree
  - id: client-hmr
    resource: packages/client/hmr/src/client/index.ts
    title: Graph frames synchronize the current page entry controller
---

# 安装方式

以下为 plain watched plugin 流程。已有 `dsh.bundle.patch` 的本地包走 [本地 bundle 安装](install-local-bundle.md)，不要再插入同名 watched 行。外部 Desktop 安装使用该 bundle 路径；Creator+ 会话内的 plain 插件继续用固定工具及其当前 Host 票据。

# 步骤

1. 先读 [RC8 external client build](../contracts/client-build.md)，构建并检查 `lib/client.js` lazy-CJS handoff；`dshx check <plugin>` 必须通过。
2. `dshx activation-plan <plugin> --change new-client`。
3. 在 Creator Mode+ 内调用固定工具 `dshx_activate_new_client({ name })`；在外部 CLI 使用 `dshx activate-new-client <name> --profile web --port <当前端口>`。该动作先用官方 `dsh plugin` 产生/修复 `link:`，确认 package 与 `lib/client.js` 从活动 profile 可解析，再由限定文件的官方 HMR 处理未挂载插件的导入缓存，清理临时观察器后写入或重触发 watched patch。已挂载插件跳过导入准备，Host PID 保持不变。
4. 命令成功标准是退出 0 且同时报告 `HOST_TREE_ACTIVE` 与 `CLIENT_MANIFEST_PRESENT`。若失败，修正报错指向的源码、配置或访问问题，再调用同一工具；其他已授权步骤继续进行。源码改好后的旧导入失败缓存由工具处理，用户无需为此安排 Host 重启。临时 HMR 清理未被证实时，按错误中的事务目录排查。
5. Creator+ 返回的 `hostPid` 是调用工具的当前 DSH Host PID；命令返回即证明过程中没有重启该 Host。
6. 先观察当前页面。RC2 的 client HMR 对 graph 帧调用 `entries.sync(frame.graph)`，可以载入新增行。传输缺失或中断时才刷新/重开页面，并保留这个验收差异。
7. 验证插件在当前页面完成加载，再操作它的实际功能。若验收中刷新过页面，不能声称证明了同页热加载。

# 完成标准

`HOST_TREE_ACTIVE` / `CLIENT_MANIFEST_PRESENT`、页面实际加载的 `CLIENT_LOADED`、`VISUAL_BEHAVIOR_VERIFIED` 分别有证据。只看到 plugin add、patch 行或 HTTP 200 都不够。
