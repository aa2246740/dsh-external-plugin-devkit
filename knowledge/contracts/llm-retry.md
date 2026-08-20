---
type: Runtime Contract
title: Provider-owned LLM retry budget
description: 自动重试由 shipped dsh-llm-retry 执行；RC8 默认 maxRetries 为 5，只覆盖瞬时码。
tags: [llm, retry, timeout]
aliases: [retry, retries, maxRetries, retryPolicy, dsh-llm-retry, 重试, 自动重试, five retries, two retries]
status: stable
resource: packages/llm/llm/src/retry-policy.ts
generated: { by: dshx/grok-4.6, at: 2026-08-17T14:00:00Z }
stale_after: 2026-11-17
verified_against: { tag: dsh-v0.1.0-rc.8, sha: 141eb6fef83422698aef7a981029e843e8161534, date: 2026-08-20 }
sources:
  - id: policy
    resource: packages/llm/llm/src/retry-policy.ts
    title: resolveRetryPolicy defaults
  - id: plugin
    resource: packages/llm/llm-retry/src/index.ts
    title: dsh-llm-retry on agent/request-error
  - id: adapter-doc
    resource: docs/user/develop/practice/llm-adapter.md
    title: Official LLM adapter guide
---

# 谁拥有重试

| 角色 | 职责 |
|---|---|
| Provider adapter | 在注册路由时发布 `retryPolicy`（`resolveRetryPolicy`） |
| `dsh-llm-retry` | 听 `agent/request-error`，按该策略决定 `{ kind: 'retry' }` |
| 业务插件 | 可以 **发布** 自己的 policy；不要重写 shipped retry 插件 |

`resolveRetryPolicy(undefined)` 的官方默认：[^policy]

- `mode: 'normal'`
- `maxRetries: 5`（第一次失败之后还能再试 **五次**，最多六次请求）
- `retryableCodes`: `EMPTY_RESPONSE` `RATE_LIMIT` `SERVER` `TIMEOUT` `TRANSPORT`
- backoff：500ms 起，上限 10s，jitter 0.1

`mode: 'always'` 会重试该路由上每一次模型请求失败，直到成功、取消或 dispose。不要当默认。

# 次数怎么数

`dsh-llm-retry` 在同一 `turn` / `step` / `provider` / `policyKey` 上数已写入的 `llm/retry` 事件。`previousRetry >= maxRetries` 就 `next()`，把失败交给后面的 listener，**不再自动试**。[^plugin]

因此 RC8 的默认预算耗尽点是五次 retry，不再是 rc.7 的两次。若观察到两次后停，先检查 provider override、旧 Host/旧包或错误码是否不在 retryable 集合，不能把它写成 RC8 默认。见 [retry-budget-exhausted](/pitfalls/two-retry-stop.md)。

# 插件能改什么

- 在自己的 adapter `Config` 上暴露 `retryPolicy`，调用 `resolveRetryPolicy(config.retryPolicy, '…')`
- 失败给用户看时，可在 **不改 `code`** 的前提下追加「再发一条 / 开新对话」
- **不能**靠改 `dsh-llm-retry` 源码来加次数；那是 shipped 插件

空闲断流本身是 [llm-timeout](llm-timeout.md)。错误码形状是 [llm-error](llm-error.md)。

[^policy]: resolveRetryPolicy defaults
[^plugin]: dsh-llm-retry on agent/request-error
