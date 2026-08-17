---
type: Runtime Contract
title: LLM adapter surface
description: 新 provider 实现 LlmAdapter.stream、抛 LlmError、registerAdapter，并发布 retryPolicy。
tags: [llm, adapter, provider]
aliases: [adapter, LlmAdapter, registerAdapter, StreamChunk, provider, 模型适配器]
status: stable
resource: docs/user/develop/practice/llm-adapter.md
generated: { by: dshx/grok-4.6, at: 2026-08-17T14:00:00Z }
stale_after: 2026-11-17
sources:
  - id: guide
    resource: docs/user/develop/practice/llm-adapter.md
    title: Official LLM adapter guide
  - id: cookbook
    resource: docs/cookbook/adding-an-llm-adapter.md
    title: Adding an LLM adapter
  - id: pi
    resource: packages/llm/llm-pi-ai
    title: Shipped Pi adapter
  - id: deepseek
    resource: packages/llm/llm-deepseek
    title: Shipped DeepSeek adapter
---

# 最小形状

```ts
export const name = 'my-llm-adapter'
export const inject = ['llm']

export function apply(ctx: Context, config: Config) {
  ctx.llm.registerAdapter(config.providers, adapter)
}
```

`stream()` 把 `GenerateOptions` 译成供应商协议，再译回 `StreamChunk`。每个 `block-start` 必须有 `block-end`；`finish` 是最后一块。协议细节读官方指南，不要把整篇拷进插件。[^guide]

# 和重试 / 超时的接缝

- 适配器 **拥有** `retryPolicy`；省略则 `resolveRetryPolicy(undefined)` → 两次、五个瞬时码。见 [llm-retry](llm-retry.md)
- HTTP 流式适配器应设 `streamIdleTimeoutMs` 并用 `idleWatchdog`。见 [llm-timeout](llm-timeout.md)
- 失败必须 `throw new LlmError(message, code)`。见 [llm-error](llm-error.md)
- 每个 provider HTTP 请求合并 `attributionHeaders()`，并转发 `options.signal`

# 不要

- 静默丢掉供应商不支持的字段；做不到就抛稳定码
- 在业务插件里 fork `dsh-llm-retry`
- 把 Creator 宿主模型的 retry 和你这条 provider 路由的 retry 当成同一份配置

对照实现：`packages/llm/llm-pi-ai`、`packages/llm/llm-deepseek`。

[^guide]: Official LLM adapter guide
