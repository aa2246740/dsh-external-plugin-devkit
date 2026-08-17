---
type: Pitfall
title: Killing the host from inside a session
description: Agent 为了让插件生效杀掉 dsh web 后，该会话会永久显示运行中。
tags: [restart, process]
aliases: ["kill", "suicide", "自杀", "taskkill", "运行中", "running"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: disc-387
    resource: https://github.com/deepseek-ai/deepseek-harness/discussions/387
    title: Agent kills host
---

# 现象

`:3080` 掉线；Stop generating；Session log `Failed to fetch`；外面拉起 web 后该会话仍 running。

# 根因

最后落盘停在 `tool/call`，没有 result / step/end / turn/end。客户端 `settled===undefined` → running。

# 做什么

永远用 [restart-outside](../playbooks/restart-outside.md)。不要续那个会话。
