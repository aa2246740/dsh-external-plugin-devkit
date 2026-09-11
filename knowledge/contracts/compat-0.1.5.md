---
type: Runtime Contract
title: 0.1.5-rc.2 plugin API replacements
description: 从 0.1.2-rc.1 升到 0.1.5-rc.2 后，外部插件必须改掉的死 API 与对应替换。dshx check 会按这些模式报错。
tags: [compat, 0.1.5, api, migration, check]
aliases: [0.1.5, compat, MessageText, addImages, createDraftImages, assistant/chunk, ctx.agent, EpochHeader.system, PendingSubmission.images]
status: stable
verified_against: { tag: dsh-v0.1.5-rc.2, sha: fb2c4b9e698e30edb738bca4cf0618587db7d203, date: 2026-09-11 }
sources:
  - id: epoch-header
    resource: packages/core/session/src/types.ts
    title: EpochHeader without system
  - id: assistant-attempt
    resource: packages/core/session/src/types.ts
    title: assistant/attempt embedded stream
  - id: markdown-text
    resource: packages/client/ui-primitives/src/index.ts
    title: MarkdownText export
  - id: input-actions
    resource: packages/client/ui-conversation/src/client/contract/input.ts
    title: InputActions.addAttachments
  - id: create-drafts
    resource: packages/client/ui-conversation/src/client/service.ts
    title: Conversation.createDrafts
  - id: pending-submission
    resource: packages/api/session-controller/src/client/contract/session.ts
    title: PendingSubmission.attachments
  - id: command-input
    resource: packages/interaction/commands/src/types.ts
    title: CommandInputDescriptor.attachments
  - id: agents
    resource: packages/core/agent/src
    title: ctx.agents registry
  - id: pi-ai-profile
    resource: packages/llm/llm-pi-ai/src/config.ts
    title: ResolvedPiAiProviderProfile
---

# 先读替换，再改源码

`dshx check` 对下面的死符号报 `compat-015-*`。修好后必须再 `check` 一次；本表不是 live activation 证明。

构建配置另见 [client-build](client-build.md)：`DSHX_HARNESS` 是目标 checkout 的显式钉，优先于 `~/.config/dshx/harness`。

# 替换表

| 死 API | 替换 | 官方位置 |
|---|---|---|
| `MessageText`（`dsh-client-ui-primitives`） | `MarkdownText` | `packages/client/ui-primitives/src/index.ts` |
| `InputActions.addImages` | `createDrafts(sessionId, files)` 得到 `DraftAttachmentId[]`，再 `addAttachments(ids)` | `ui-conversation` `InputActions` / `Conversation.createDrafts` |
| `createDraftImages` | `Conversation.createDrafts`；image MIME 仍是 image draft，其余立刻变成 file draft 并开始上传 | `ui-conversation/src/client/service.ts` |
| `PendingSubmission.images` | `PendingSubmission.attachments`；图片项是 `{ type: 'image', value }` | session-controller client contract |
| `CommandInputDescriptor.images` | `attachments?: boolean`；缺省或 false 会拒带附件的调用 | `packages/interaction/commands/src/types.ts` |
| `EpochHeader.system` | 系统提示是派生历史：最新 `system/message`，不是 header 字段 | `packages/core/session/src/types.ts` |
| 监听 `'assistant/chunk'` | 耐久文本在 `assistant/attempt.stream`；不要订阅顶层 chunk 事件 | `SessionEventMap['assistant/attempt']` |
| `ctx.agent` / `inject: ['agent']` | `ctx.agents` / `inject: ['agents']`。保留 `ctx.agentLoop`、`ctx.agentPresets`、`ctx.agentDefaultModel` | `docs/subsystems/core.md` |
| 旧 `ResolvedPiAiProviderProfile` 形状 | 现字段含 `provider`、`displayName`、`apiKeyEnv?: CredentialRef`、`streamIdleTimeoutMs`、`maxRequestImageBytes`、`requestImagePixelBudget`、`requestImageMaxBytes`、`retryPolicy`、`piProvider?`、`modelErrors`、`configuredMaxTokens` | `packages/llm/llm-pi-ai/src/config.ts` |

# 构建钉

`update prepare` / `apply` 会把 `DSHX_HARNESS` 固定到正在构建的 checkout，同时 `~/.config/dshx/harness` 仍指向活动 runtime。client `tsdown.config.ts` 必须：

1. 若 `process.env.DSHX_HARNESS` 有值，用它；
2. 否则读 `~/.config/dshx/harness`；
3. 不要要求这两个根路径必须相同。

`dshx init --kind client` 已按这个顺序生成。`dshx check` 对 `roots.length !== 1` 的旧模板报 `client-harness-pin`。

# 完成条件

- `dshx check <plugin>` 没有 `compat-015-*` 或 `client-harness-pin`；
- client 包仍满足 [client-build](client-build.md) 的 lazy-CJS handoff；
- 需要隔离冷启动时再跑 `verify-boot`。到这里只有 `SOURCE_BUILT`，不是当前 Host 或 UI 证明。
