---
type: Playbook
title: Restart the host from outside
description: 插件/配置生效需要重启时，用 dshx stop/start/restart，不要从会话里杀 PID。
tags: [restart, host]
aliases: ["restart", "stop", "kill host", "外面重启", "already supervising", "already supervises", "dshx stop", "dshx restart"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: disc-387
    resource: https://github.com/deepseek-ai/deepseek-harness/discussions/387
    title: Agent kills host
---

# 为什么

Agent 在 Creator / Standard 里对宿主做 `kill` 后：

- `:3080` 掉线
- 最后落盘事件停在那次 `tool/call`
- 浏览器停在 Stop generating
- 外面把 `dsh web` 拉起来后该会话仍显示 running

`workspace-write` **不拦**杀进程。这是 [host-suicide](../pitfalls/host-suicide.md)。

# 怎么做

```sh
pnpm dshx status
pnpm dshx restart              # 复用上次 plugin / port
pnpm dshx stop
pnpm dshx start web hello
```

`dshx` 把 pid 记在 `.dshx/host.json`（gitignored），SIGTERM，必要时 SIGKILL。这发生在 DSH 进程外，会话不会变成「自己杀自己」。

`dshx restart` 先打印 `stopped`（旧 pid），再打印新的 `start` / `spawned`。不要因为第二条横幅写着 `dshx start` 就以为没停旧进程。

# 已经在监督

第二次 `dshx start` 若本工具已经 supervises 一个 pid，会报 `already-supervising`，提示 `dshx stop` 或 `dshx restart`。`--force` **不会**接管你已经在监督的宿主。

不要先看默认 3080 是否被别人占用再决定停不停：监督中的 workshop 端口可能是 3091。先 `dshx status`。

# 重启之后

旧 session 看不到新 generation。开 **新会话** 看工具列表。被杀掉的那次会话不要 Continue。
