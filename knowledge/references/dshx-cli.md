---
type: Reference
title: dshx command surface
description: 外部插件工作台的命令、状态目录与非目标。
tags: [dshx, cli]
aliases: [dshx, cli, kb catalog, kb search, catalog, which, "dshx status", status, unsupervised, "busy port", "already in use", "3091", "--force", "--port", "--harness", "port-3080", "host-supervised", "activation-plan", "activate-new-client", "verify-boot", "sync-artifact", "restart-supervised"]
status: stable
resource: tools/dshx/src/cli.ts
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
---

# 入口

```sh
dshx help
dshx kb
dshx kb catalog
dshx kb search retry
dshx kb cat contracts/llm-retry
```

实现：`tools/dshx/src/cli.ts`。状态：`.dshx/`（gitignored）——`host.json`、`last-host.json`、`logs/`、`overlays/`，以及 `creator-plus/` 下的 claims、transactions、quarantines、incidents 与 Guardian heartbeat/control。

`--harness <path>` 对所有命令生效，可以在命令名前或后。显式 flag 验证成功后
直接选定 checkout；没有 flag 时，env/config/cwd 三种发现必须指向同一根，冲突
就失败关闭。用 `dshx which --harness <path>` 明示一次切换，不要依赖当前目录猜。

`dshx status` 分得清：正在监督的宿主、上次 workshop 端口、以及「3080 在听但不是我们的」。默认 3080 被别人占（busy port / already in use）时，`start` / `verify-boot` 应换 `--port 3091`，不要 `--force`，也不要在 Harness 会话里杀进程。

第二次 `start` 若已经在监督，报 `already-supervising`。先读 lifecycle；确需重启时用 `restart-supervised`。`--force` 在 **start/verify-boot** 上不能接管自己的宿主，也不该用来抢 :3080。

`init --force` 是另一件事：覆盖已有脚手架文件，见 [init-plugin](../playbooks/init-plugin.md)。`kb search --force` 搜的是词，不是在强制执行。

旗标按命令生效：`dshx kb search --keep` 是在搜词 `--keep`，不是 verify 的留宿主旗标。`--` 之后的 token 一律当参数。

`dshx logs` 在宿主空闲时读 `last-host.json` 记下的 log（web 或 headless），不是永远 `.dshx/logs/web.log`。headless 不占用 HTTP 端口；`status` 不得把上次 headless 说成「:3080 还是我们的」。

# 生命周期命令

- `activation-plan <target> --change ...`：只读磁盘 inventory 和分支计划，不宣称 live Loader 状态。
- `activate-new-client <name> --profile web --port <当前端口>`：只接受 `my-plugins` 目标；先 link/解析，再写或重触发 watched patch，最后验证当前 Host manifest 与 served client。无 restart、无浏览器控制；成功仍要求刷新后另验 `CLIENT_LOADED`。
- `verify-boot`（`verify` alias）：隔离 cold boot；已有 supervised Host 时拒绝，绝不自动 stop。
- `sync-artifact`（`ship` / `recopy` alias）：link/file artifact，同步完成仍为 `LIVE_ACTIVATION_UNPROVEN`。
- `restart-supervised`（`restart` alias）：只重启当前 live dshx-owned Web PID；无 live PID、换目标、headless 均拒绝。
- `creator watch/claim/release/recovery/disarm/client-failure`：bridge v2 内部结构化协议。`client-failure` 只接受固定 Host bridge 写入环境的有界 browser report；模型只通过六个固定工具间接使用，不能提交任意 argv。`dshx status` 可读 Guardian、claims 与 quarantines。

`dshx start web` 会启动外部 Guardian。Creator+ session-start 还可以领养由官方 CLI/App
启动的 Web Host并武装 Guardian，但 `stop` / `restart-supervised` 拒绝手工控制这个
adopted PID。真实故障的固定恢复、正常退出 disarm 与 crash-loop fuse 见
[creator-guardian](../contracts/creator-guardian.md)。

RC8 的原始 `dsh web` 默认打开浏览器。`dshx start web` 与 `verify-boot` 作为
自动化 supervisor 始终加 `--no-open`；是否刷新现有页面仍由 lifecycle 分支决定。

# 非目标

- 不修改 Harness 核心
- 不修复孤儿 tool-call 400，也不把浏览器纯 client exception 当成 Host 自愈
- 不替代官方 dump / plugin / cancel
- 不把社区 doctor 装进默认 profile
- 不在这次开发里写产品插件案例（用户稍后给真实案例）
