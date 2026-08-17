---
type: Runtime Contract
title: Event dispatch and turn flow
description: 五种 @mode 以及 agent/tools waterfall 在 turn 里的位置。
tags: [events, waterfall, turn]
aliases: ["events", "waterfall", "turn", "step", "agent/request"]
status: stable
resource: vendor/cordis/src/events.ts
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: events-ts
    resource: vendor/cordis/src/events.ts
    title: Dispatch implementation
  - id: tutorial-04
    resource: docs/cordis-tutorial/04-events.md
    title: Events tutorial
  - id: architecture
    resource: docs/architecture.md
    title: Turn flow
---

# 五种 mode

`@mode` 是每条事件合同的一部分。primer 表缺 `bail`，以源码为准。

| mode | 语义 |
|---|---|
| `emit` | 同步 fire-and-forget |
| `parallel` | await 全部监听器 |
| `serial` | 异步等待；首个非 null/false/undefined 即停 |
| `bail` | 同步；同样在首个有效返回处停止 |
| `waterfall` | around-middleware，最后一参 `next()`；不调用即 veto |

Turn 流里：`agent/pre-step`、`agent/request`、`llm/stream`、`tools/pre-execute` \| `execute` \| `post-execute` 是 waterfall；`agent/turn-stopping` 是 serial，没有 `next()`。

# Turn / step

- **step**：一次模型请求 + 它调用的工具
- **turn**：零或多个 step；先开再领输入，欠债清完才关

```
turn/start
  agent/pre-step
  step/start
  agent/request -> llm/stream -> assistant/chunk* -> assistant/message
  tool/call* -> tools/* -> tool/result*
  step/end
  agent/turn-stopping
turn/end
```

# 扩展时选域

- 必须活过 reload → Session 事件（先入日志）
- 观察飞行中的 Agent → `agent/*`
- 能力策略 → `fs/*` `tools/*` 等，不要改 `agent-loop`
