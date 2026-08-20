---
type: Playbook
title: Diagnose model timeout and retry UX
description: 模型超时 / retry 预算耗尽时，先确认 RC8 默认五次与 provider override，再看插件，不要先改 Harness 核心。
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
dshx kb cat maps/symptoms
dshx kb cat contracts/llm-retry
dshx kb cat contracts/llm-timeout
dshx kb cat contracts/llm-error
dshx session list
```

1. 确认失败码是不是 `TIMEOUT` / `TRANSPORT` / `SERVER` / `RATE_LIMIT` / `EMPTY_RESPONSE`。路由看 `code`。
2. 确认这条 **provider 路由** 的 `retryPolicy`。RC8 省略 = 官方最多 retry 五次；两次后停通常表示 override、旧版本或不可重试错误码。
3. 确认 adapter 是否把空闲断流打成 `TIMEOUT`（`streamIdleTimeoutMs`，默认 5 分钟）。
4. `dshx session list`：若已有孤儿 `tool_call`，先按 [new-session](new-session.md) 换会话，再谈 UX。
5. 插件侧只做两件事：暴露 policy、给瞬时错误加「再发一条」提示。不要 fork `dsh-llm-retry`。

# 验证

改的是 scratch 插件就 `dshx check` + 插件自己的测试；需要隔离启动时用 `dshx verify-boot`，现有 Host 则按 activation branch 验。不要用 dump-config 退出码证明运行时 retry 行为。
