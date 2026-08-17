---
type: Runtime Contract
title: Persistence and interrupted turns
description: 官方只给仍 OPEN 的尾回合补合成 tool error。CLOSED error 伤疤不会自愈。
tags: [persistence, session, interrupted]
aliases: ["interrupted", "pendingCalls", "crash recovery", "伤疤"]
status: stable
resource: docs/subsystems/persistence.md
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: persistence
    resource: docs/subsystems/persistence.md
    title: Crash recovery preserves an interrupted turn
  - id: disc-2034
    resource: https://github.com/deepseek-ai/deepseek-harness/discussions/2034
    title: Session permanently un-resumable
---

# 官方会修的

冷加载时：打开的 `turn/start` 没有 `turn/end` → 合成 `turn/end { reason: { kind: 'interrupted' } }`，并补仍 OPEN 尾回合缺失的 tool error。

活着的 running：`Agent.cancel(cause, { keepInbox })`（web 的 `session.cancel` 即此包装）。

# 官方不会修的

回合若已 `turn/end`（含 `reason:error`）会清空 `pendingCalls`，孤儿 `tool_call` 留在日志里。后续同一会话全部 400。出路是 **新会话或 headless**。

`dshx session inspect` 只读标出这些伤疤，不改 JSONL。改历史是社区 sanitizer 的事，不要抬成合同。对照表见 [turn-error](turn-error.md)。
