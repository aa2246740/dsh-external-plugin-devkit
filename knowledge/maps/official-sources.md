---
type: Map
title: Official files an external agent should open
description: 先合同后指南的官方文件清单，以及长文被拆进了哪些概念。
tags: [map, sources]
aliases: [official sources, docs/, 官方文档, 长文, 原件]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T14:00:00Z }
stale_after: 2026-11-17
---

钉：合同对照官方 **0.1.0-rc.8**（tag `dsh-v0.1.0-rc.8`，SHA `141eb6fef83422698aef7a981029e843e8161534`）。工作台 checkout 的 `package.json` 可能仍显示更早 rc；以官方 tag / npm `@deepseek-ai/dsh*` 为准。路径相对仓库根。

**不要先把这些文件整篇读完。** 先走 [symptoms](symptoms.md) 或下面的「已拆成」列，需要逐条核对再打开原件。

# 已拆成概念的长文

| 官方原件 | 拆进 |
|---|---|
| `packages/llm/llm/src/retry-policy.ts`、`packages/llm/llm-retry/src/index.ts` | [llm-retry](/contracts/llm-retry.md) |
| `packages/llm/llm-pi-ai/src/adapter.ts`、`llm-deepseek/src/adapter.ts` | [llm-timeout](/contracts/llm-timeout.md) |
| `packages/llm/llm/src/{index,error}.ts` | [llm-error](/contracts/llm-error.md) |
| `docs/user/develop/practice/llm-adapter.md`、`docs/cookbook/adding-an-llm-adapter.md` | [llm-adapter](/contracts/llm-adapter.md) |
| `docs/user/develop/basic/config.md` | [plugin-config](/contracts/plugin-config.md) |
| `docs/cookbook/adding-a-settings-card.md`、`docs/subsystems/settings.md`、`installSettingsSection` | [settings-card](/contracts/settings-card.md) |
| `docs/user/develop/basic/index.md`、`vendor/cordis/src/registry.ts` | [plugin-forms](/contracts/plugin-forms.md) |
| `docs/cookbook/adding-a-tool.md`、`docs/user/develop/basic/tool.md` | [define-tool](/contracts/define-tool.md) |
| `vendor/cordis/src/events.ts`、`docs/cordis-tutorial/04-events.md` | [events](/contracts/events.md) |
| `docs/subsystems/persistence.md` | [persistence](/contracts/persistence.md)、[turn-error](/contracts/turn-error.md) |
| `docs/architecture.md`（扩展缝） | [extension-points](/maps/extension-points.md) |
| `apps/cli/src/dump-config.ts` | [dump-config](/contracts/dump-config.md) |
| `apps/cli/src/profile-boot.ts`、`plugin.ts`、Web/client HMR | [live-activation](/contracts/live-activation.md) |
| Creator preset + tool-cordis | [creator-mode](/contracts/creator-mode.md)、[tool-cordis](/contracts/tool-cordis.md) |
| `packages/client/tsdown.client.ts`、`packages/client/web/src/{platform,boot}.ts` | [client-build](/contracts/client-build.md)、[live-activation](/contracts/live-activation.md) |

# 仍应打开的权威清单

1. `packages/extensions/tool-cordis/src/index.ts`
2. `docs/tool-catalog.md`
3. `apps/cli/config/agent-presets/cordis/{agent.cordis.yml,preset.yml}`
4. `apps/cli/config/agent-presets/{standard,code,minimal}/agent.cordis.yml`
5. `packages/bundle/base/cordis.patch.yml`、`packages/bundle/web-app/cordis.patch.yml`
6. `packages/boot/app-boot/src/profile.ts`、`packages/boot/app-boot/src/index.ts`
7. `vendor/cordis/src/{fiber.ts,events.ts,registry.ts}`
8. `packages/preset/agent-presets/src/preset.ts`
9. `apps/cli/src/{profile-boot.ts,plugin.ts,dump-config.ts,args.ts}`、`apps/cli/reference/README.md`
10. `website/docs.ts`
11. `docs/architecture.md`、`docs/testing.md`
12. `packages/core/agent-loop/src/invariant.ts`
13. `docs/cookbook/{adding-a-tool,adding-a-settings-card,extension-cookbook,adding-an-llm-adapter,adding-a-conversation-node}.md`
14. `docs/user/develop/basic/{index,tool,config,publish}.md`
15. `docs/user/develop/framework/{index,service,events}.md`、`docs/cordis-tutorial/01-04`
16. `packages/llm/llm/src/retry-policy.ts`、`packages/llm/llm-retry/src/index.ts`
17. `packages/preset/agent-presets/README.md`、`packages/extensions/cordis-host-runner/README.md`
18. Creator skills：只收 workflow；工具动词过时
19. `packages/client/{modules,hmr,web}` 与 `vendor/hmr`：client graph/HMR 和 server module-HMR 边界
20. `packages/subagent/{subagent-codex,subagent-claude-code}` 与 Creator composition skill：RC8 可选 Profile Bundle、权限和命名实例

降权：`tool-cordis/README.md`、`examples/web-cordis`、Agent Note 2026-07-08、primer 的 mode 表、未进站点的 `docs/subsystems/extensions.md`。
