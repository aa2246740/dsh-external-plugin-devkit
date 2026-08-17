---
type: Runtime Contract
title: LLM stream idle timeout
description: 已发布 adapter 用 idleWatchdog 把空闲断流打成 LlmError TIMEOUT；默认 300_000ms。
tags: [llm, timeout, stream]
aliases: [timeout, idle, streamIdleTimeoutMs, LLM_STREAM_IDLE_TIMEOUT, 超时, 断流, stream idle]
status: stable
resource: packages/llm/llm-pi-ai/src/adapter.ts
generated: { by: dshx/grok-4.6, at: 2026-08-17T14:00:00Z }
stale_after: 2026-11-17
sources:
  - id: pi
    resource: packages/llm/llm-pi-ai/src/adapter.ts
    title: Pi adapter idleWatchdog
  - id: deepseek
    resource: packages/llm/llm-deepseek/src/adapter.ts
    title: DeepSeek adapter idleWatchdog
  - id: default
    resource: packages/llm/llm-pi-ai/src/config.ts
    title: DEFAULT_STREAM_IDLE_TIMEOUT_MS
---

# 合同

已发布的 HTTP 流式 adapter（`dsh-llm-pi-ai`、`dsh-llm-deepseek`）在 `stream()` 里套 `idleWatchdog(upstream, streamIdleTimeoutMs, …)`。

空闲超过阈值 → 抛 `LlmError(..., 'TIMEOUT')`。Pi 适配器的 watchdog 码是 `LLM_STREAM_IDLE_TIMEOUT`，再包成 `TIMEOUT`。[^pi]

默认 `streamIdleTimeoutMs = 300_000`（5 分钟）。[^default]

这 **不是** `dshx verify --timeout`（那是 CLI 等宿主起来的秒数）。也不是会话 400。

# 和重试的关系

`TIMEOUT` 在默认 `retryableCodes` 里。shipped `dsh-llm-retry` 会按 [llm-retry](llm-retry.md) 再试，默认两次。预算用尽后本轮结束，不会自己再开一轮。

# 插件能改什么

- 在自己的 provider `Config` 上暴露 `streamIdleTimeoutMs`
- 不要把 CLI / HTTP / 工具超时和模型空闲超时写成同一个概念
- 路由对 `code`，不要解析 `message` 里的毫秒数

[^pi]: Pi adapter idleWatchdog
[^default]: DEFAULT_STREAM_IDLE_TIMEOUT_MS
