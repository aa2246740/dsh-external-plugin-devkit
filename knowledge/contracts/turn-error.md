---
type: Runtime Contract
title: CLOSED error turns do not self-heal
description: turn/end reason:error 会清空 pendingCalls；官方只补仍 OPEN 的尾回合。
tags: [session, turn, error]
aliases: [turn/end, reason:error, interrupted, pendingCalls, 自愈, closed error]
status: stable
resource: docs/subsystems/persistence.md
generated: { by: dshx/grok-4.6, at: 2026-08-17T14:00:00Z }
stale_after: 2026-11-17
sources:
  - id: persistence
    resource: docs/subsystems/persistence.md
    title: Crash recovery preserves an interrupted turn
  - id: session-truth
    resource: /contracts/session-truth.md
    title: Session log is the model context
---

# 两种结束

| 状态 | 官方做什么 | 插件 / Agent 做什么 |
|---|---|---|
| 冷加载时 `turn/start` 没有 `turn/end`（仍 OPEN） | 合成 `turn/end { reason: { kind: 'interrupted' } }`，并补缺失 tool error | 不要手改 JSONL |
| 回合已经 `turn/end`（含 `reason:error`） | **不清** 日志里的孤儿 `tool_call`；`pendingCalls` 已空 | 新会话或 headless |

`interrupted` 是 loop **不会**自己 emit 的 `TurnEndReason`，只用于崩溃恢复。[^persistence]

# 和模型失败的关系

`dsh-llm-retry` 预算用尽后，本 step 以错误结束。若 turn 已经 `reason:error` 且日志里留下未配对的 `tool/call`，同一会话 Continue → 400。这是 [orphan-tool-call](/pitfalls/orphan-tool-call.md)，不是再调一次 retry 能修好的。

动作：[new-session](/playbooks/new-session.md)，先 `dshx session list`。

[^persistence]: Crash recovery preserves an interrupted turn
