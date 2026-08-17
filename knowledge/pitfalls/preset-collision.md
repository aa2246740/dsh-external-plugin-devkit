---
type: Pitfall
title: Two cordis presets in one process
description: cordisInspect.register 对重复的 Service/Event/Builtin/Tool id 抛错，新对话 agent-preset-invalid。
tags: [preset, cordis]
aliases: ["preset collision", "agent-preset-invalid"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: disc-818
    resource: https://github.com/deepseek-ai/deepseek-harness/discussions/818
    title: 新对话开不了
---

# 现象

`SessionCreateError: preset "…" failed to mount` / `Host Cordis inspect provider "Service" is already registered`

# 修法

不要同时站着两个带 `@deepseek-ai/dsh-tool-cordis` 的预设；拷贝里关掉 tool-cordis，除非确实要那七个工具；或把 tool-cordis 挪到 host composition 只挂一次。
