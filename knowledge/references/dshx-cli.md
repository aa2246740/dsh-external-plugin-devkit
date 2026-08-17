---
type: Reference
title: dshx command surface
description: 外部插件工作台的命令、状态目录与非目标。
tags: [dshx, cli]
aliases: [dshx, cli, kb catalog, kb search, catalog, which, "dshx status", status, unsupervised, "busy port", "already in use", "3091", "--force", "--port", "port-3080", "host-supervised"]
status: stable
resource: tools/dshx/src/cli.ts
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
---

# 入口

```sh
pnpm dshx help
pnpm dshx kb
pnpm dshx kb catalog
pnpm dshx kb search retry
pnpm dshx kb cat contracts/llm-retry
```

实现：`tools/dshx/src/cli.ts`。状态：`.dshx/`（gitignored）——`host.json`、`last-host.json`、`logs/`、`overlays/`。

`dshx status` 分得清：正在监督的宿主、上次 workshop 端口、以及「3080 在听但不是我们的」。默认 3080 被别人占（busy port / already in use）时，`start` / `verify` 应换 `--port 3091`，不要 `--force`，也不要在 Harness 会话里杀进程。

第二次 `start` 若已经在监督，报 `already-supervising`（`dshx stop` / `restart`）。`--force` 在 **start/verify** 上只对「端口被陌生人占用」有意义，不能接管自己的宿主，也不该用来抢 :3080。

`init --force` 是另一件事：覆盖已有脚手架文件，见 [init-plugin](../playbooks/init-plugin.md)。`kb search --force` 搜的是词，不是在强制执行。

旗标按命令生效：`dshx kb search --keep` 是在搜词 `--keep`，不是 verify 的留宿主旗标。`--` 之后的 token 一律当参数。

`dshx logs` 在宿主空闲时读 `last-host.json` 记下的 log（web 或 headless），不是永远 `.dshx/logs/web.log`。headless 不占用 HTTP 端口；`status` 不得把上次 headless 说成「:3080 还是我们的」。

# 非目标

- 不修改 Harness 核心
- 不提供同会话 400 自愈
- 不替代官方 dump / plugin / cancel
- 不把社区 doctor 装进默认 profile
- 不在这次开发里写产品插件案例（用户稍后给真实案例）
