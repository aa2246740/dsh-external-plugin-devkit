---
type: Pitfall
title: Orphan tool_call locks the same session at 400
description: CLOSED error 回合清空 pendingCalls，伤疤留在日志，Continue 一律 INVALID_REQUEST。
tags: [session, 400, tool_call]
aliases: ["orphan", "tool_call", "400", "INVALID_REQUEST", "伤疤", "session scar"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: disc-1544
    resource: https://github.com/deepseek-ai/deepseek-harness/discussions/1544
    title: Insufficient tool messages
  - id: disc-2034
    resource: https://github.com/deepseek-ai/deepseek-harness/discussions/2034
    title: Permanently un-resumable
---

# 现象

`An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'`

典型触发：Creator 写插件时工具 `prepare` 读到 undefined；或模型建议重启 web。

# 根因

官方 `interruptedTurnClosers` **只给仍 OPEN 的尾回合**补合成结果。回合已 `turn/end`（含 `reason:error`）会清空 `pendingCalls`。

# 做什么

`dshx session inspect` 确认孤儿 id → 新会话或 headless。见 [new-session](../playbooks/new-session.md)。

同会话修复只有社区 sanitizer / 手改 JSONL，preview 一变可能失效。#1363 有人说换会话也不好，与 #2034 不完全一致。
