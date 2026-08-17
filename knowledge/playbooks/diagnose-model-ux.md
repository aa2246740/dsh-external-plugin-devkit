---
type: Playbook
title: Diagnose model timeout and retry UX
description: 模型超时 / 停在两次重试之后时，先读合同再看插件，不要先改 Harness 核心。
tags: [llm, retry, timeout, diagnose]
aliases: [diagnose, 模型停了, 网络不稳, timeout ux]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T14:00:00Z }
stale_after: 2026-11-17
sources:
  - id: retry
    resource: /contracts/llm-retry.md
    title: Provider-owned retry budget
  - id: timeout
    resource: /contracts/llm-timeout.md
    title: Stream idle timeout
---

# 步骤

```sh
pnpm dshx kb cat maps/symptoms
pnpm dshx kb cat contracts/llm-retry
pnpm dshx kb cat contracts/llm-timeout
pnpm dshx kb cat contracts/llm-error
pnpm dshx session list
```

1. 确认失败码是不是 `TIMEOUT` / `TRANSPORT` / `SERVER` / `RATE_LIMIT` / `EMPTY_RESPONSE`。路由看 `code`。
2. 确认这条 **provider 路由** 的 `retryPolicy`。省略 = 官方两次。
3. 确认 adapter 是否把空闲断流打成 `TIMEOUT`（`streamIdleTimeoutMs`，默认 5 分钟）。
4. `dshx session list`：若已有孤儿 `tool_call`，先按 [new-session](new-session.md) 换会话，再谈 UX。
5. 插件侧只做两件事：暴露 policy、给瞬时错误加「再发一条」提示。不要 fork `dsh-llm-retry`。

# 验证

改的是 scratch 插件就 `dshx check` + 插件自己的测试 + `dshx verify`。不要用 dump-config 退出码证明运行时 retry 行为。
