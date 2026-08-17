---
type: Pitfall
title: Model stops after two timeouts
description: 两次 TIMEOUT 后停是 dsh-llm-retry 默认预算，不是登录插件独有的 bug。
tags: [retry, timeout, ux]
aliases: [two retries, stops after two, 两次后停, 不再重试, 没有提示]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T14:00:00Z }
stale_after: 2026-11-17
sources:
  - id: policy
    resource: packages/llm/llm/src/retry-policy.ts
    title: maxRetries default 2
  - id: plugin
    resource: packages/llm/llm-retry/src/index.ts
    title: previousRetry >= maxRetries
---

# 现象

模型网络不稳 → 自动重试 → 两次后本轮结束 → 聊天里只剩错误，没有「再试一次」的官方提示。

# 根因

shipped `dsh-llm-retry` + `resolveRetryPolicy(undefined)`：`TIMEOUT` 默认可重试，`maxRetries: 2`。预算用尽就停。合同见 [llm-retry](/contracts/llm-retry.md)。

空闲断流来自 adapter 的 `idleWatchdog`，码是 `TIMEOUT`。见 [llm-timeout](/contracts/llm-timeout.md)。

# 不要做

- 不要为了「再试几次」去改 Harness 核心或替换 `dsh-llm-retry`
- 不要把 Creator 宿主模型的 retry 和你这条 provider 路由当成同一份配置
- 不要在已经 `turn/end reason:error` 且有孤儿 `tool_call` 的会话上 Continue

# 可以做

- 在自己的 adapter `Config` 上暴露 `retryPolicy` / `streamIdleTimeoutMs`
- 失败文案保留原 `code`，追加「再发一条；Continue 失败就开新对话」
- 用户要加大次数：改该 provider 行的 `retryPolicy.maxRetries`，然后 **进程外** `dshx restart`，必要时新会话

诊断步骤：[diagnose-model-ux](/playbooks/diagnose-model-ux.md)。
