---
type: Runtime Contract
title: Session log is the model context
description: Model-visible means logged。deriveMessages 必须等于 request.messages。
tags: [session, invariant]
aliases: ["session truth", "deriveMessages", "model-visible"]
status: stable
resource: docs/architecture.md
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: architecture
    resource: docs/architecture.md
    title: Session as source of truth
  - id: agent-loop
    resource: packages/core/agent-loop/src/agent.ts
    title: Frozen deriveMessages request boundary
  - id: persistence
    resource: docs/subsystems/persistence.md
    title: Session persistence
---

# 原则

官方表述：**Model-visible means logged.** Session 事件日志是 append-only 真相源。Trajectory 是同一窗口上的 turn 账本，不读 Chat snapshot。

# 符号级边界不变量

`packages/core/agent-loop/src/agent.ts` 在构造每次 `isAgentLoopRequest` 请求时直接从会话事件派生并冻结上下文：

`const boundaryMessages = session.deriveMessages()` → `deepFreeze(message)` + `markAgentLoopRequest(Object.freeze({ ...header.config, messages: boundaryMessages, ... }))`

（早期版本的 `@deepseek-ai/dsh-invariants` / `invariant.ts` 运行时比对已在 `0.2.1-rc.5` 前移除，改为由 `agent.ts` 直接派生并深度冻结只读请求边界。）因此任何要进模型请求的新输入，必须先成为 session 事件，无法也不应手改 `request.messages`。

# 和插件验证的关系

官方没有 Trajectory CLI。验证插件 = 看已记录的 `tool/call` / `tool/result` 和下一次完整 `request/header`。内存挂载没有专用 `cordis/mount` 事件（v1 已拒绝）。

`dshx session list|inspect` 只读扫描磁盘日志（含 zstd），用来发现孤儿 `tool_call`，不改历史。CLOSED error 会不会自愈见 [turn-error](turn-error.md)。

0.1.0-rc.7 起 max-tokens 截断后会话应仍可继续；截断本身仍是已记录事件，不是另写一条 context。
