---
type: Runtime Contract
title: LlmError stable codes
description: 适配器必须抛 LlmError；路由看 code，不要解析 message。默认只有五个码可重试。
tags: [llm, error, codes]
aliases: [LlmError, HarnessError, failure.code, RATE_LIMIT, TRANSPORT, SERVER, EMPTY_RESPONSE, 报错]
status: stable
resource: packages/llm/llm/src/index.ts
generated: { by: dshx/grok-4.6, at: 2026-08-17T14:00:00Z }
stale_after: 2026-11-17
sources:
  - id: llm-error
    resource: packages/llm/llm/src/index.ts
    title: LlmError class
  - id: harness-error
    resource: packages/llm/llm/src/error.ts
    title: HarnessError + canonical codes
  - id: adapter-doc
    resource: docs/user/develop/practice/llm-adapter.md
    title: Adapter error handling
---

# 形状

`LlmError extends HarnessError`。`code` 是稳定、可路由的字符串；`message` 给人看。[^llm-error]

Agent loop **不会**把普通 `Error` 自动收成 `LlmError`。适配器必须自己抛。[^adapter-doc]

# 默认可重试

[llm-retry](llm-retry.md) 默认只吃这些码：

| code | 含义 |
|---|---|
| `TIMEOUT` | 空闲断流或请求超时，见 [llm-timeout](llm-timeout.md) |
| `TRANSPORT` | 网络 / fetch 失败 |
| `SERVER` | 对端 5xx 一类 |
| `RATE_LIMIT` | 请求速率，不是账户额度用尽 |
| `EMPTY_RESPONSE` | 正常结束但零 content block |

# 默认不可重试（举例）

| code | 为什么 |
|---|---|
| `INVALID_CREDENTIAL` / `AUTH` / `MISSING_CREDENTIAL` | 再试也一样 |
| `QUOTA` | 账户额度，不是 RATE_LIMIT |
| `CONTEXT_WINDOW_EXCEEDED` | 请求本身超窗 |
| `NO_ADAPTER` | 路由没挂上 |

要扩大可重试集合，改该 provider 的 `retryPolicy.retryableCodes`，不要改 shipped retry 插件。

# 插件提示

可以在 **保留原 `code`** 的前提下给 `message` 追加「再发一条 / 开新对话」。不要靠改文案让 retry 插件多试一次——它看的是 `code` 和已记录的 `llm/retry` 次数。

[^llm-error]: LlmError class
[^adapter-doc]: Adapter error handling
