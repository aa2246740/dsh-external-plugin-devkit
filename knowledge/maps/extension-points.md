---
type: Map
title: Where new behavior goes
description: architecture.md 的扩展缝索引。
tags: [map, extensions]
aliases: [extension points, where to put, 往哪挂, seams]
status: stable
resource: docs/architecture.md
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: architecture
    resource: docs/architecture.md
    title: Where new behavior goes
  - id: cookbook
    resource: docs/cookbook/extension-cookbook.md
    title: Extension cookbook
---

| 目标 | 机制 | 指南 |
|---|---|---|
| 模型面工具 | `inject: ['tools']` + `ctx.tools.register(defineTool(...))` | `docs/cookbook/adding-a-tool.md` |
| Skill | `ctx.skills.registerProvider` / `register` | `docs/subsystems/skills.md` |
| Codex `$name` 调用 | `agent/pre-step` 扫描 `$kebab-name` + `renderSkillContent` | [codex-skill](/contracts/codex-skill.md)、`examples/codex-skill` |
| Native hook | `ctx.on` | `docs/cookbook/extension-cookbook.md` |
| LLM adapter | `ctx.llm.registerAdapter` | [llm-adapter](/contracts/llm-adapter.md)、`docs/cookbook/adding-an-llm-adapter.md` |
| UI / Chat 节点 | `session/event` 或 `ConversationNodeDefinition` + slots | `docs/cookbook/adding-a-conversation-node.md` |
| 插件设置卡片 | Host `installSettingsSection` + `settings.plugin.item` | [settings-card](/contracts/settings-card.md)、`docs/cookbook/adding-a-settings-card.md` |
| 设置整页 | `settings.section`（`id` / `order` / `label`） | `packages/client/ui-settings/src/client/contract/slots.ts` |
| 持久图片 | `ctx.attachments`（先落盘再写 session 事件） | `docs/subsystems/attachment.md` |
| 后台任务 / Job Panel | `ctx.jobs` | `docs/subsystems/jobs.md` |
| 人发命令 | `ctx.commands` | 不经模型 turn |
| 后台任务 | `ctx.jobs` | |
| FS / sandbox / shell | 能力缝 Definition / Provider / Consumer | |
| 动态 Cordis | `ctx.dynamicCordisRunner` / `ctx.cordisInspect` | 源码合同 |

不要改 `agent-loop` 来加产品行为。UI 插件只通过 `ctx.slots.register` 组合界面。
