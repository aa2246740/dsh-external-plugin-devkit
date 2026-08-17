---
type: Map
title: packages/ groups
description: 核心、llm、tools、web、boot 等分组职责。
tags: [map, packages]
aliases: ["packages", "包"]
status: stable
resource: AGENTS.md
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
---

来自根 `AGENTS.md`：

- `core/` session、system-prompt、tools、agent、agent-loop
- `llm/` 适配器缝 + DeepSeek / pi-ai
- `boot/` profile 合成与 app-bin
- `bundle/` 可安装 profile 层（base / web-app / headless）
- `preset/` agent preset
- `extensions/` tool-cordis、host-runner 等
- `client/` Web UI
- `session/` 持久化、投影
- `credentials/` / `settings/` 密钥与设置（不要提交）

scratch 插件放 `my-plugins/`，不要进 workspace graph。
