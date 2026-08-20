---
type: Runtime Contract
title: Authority tiers
description: 源码、文档站、仓库 docs、skill、社区材料的优先级。冲突时按这张表。
tags: [authority, docs, preview]
aliases: ["authority", "权威", "skill vs source"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: docs-agents
    resource: docs/AGENTS.md
    title: Documentation standing orders
  - id: website-docs
    resource: website/docs.ts
    title: Published docs-site route table
  - id: tool-cordis-src
    resource: packages/extensions/tool-cordis/src/index.ts
    title: Runtime tool names
---

# 合同优先序

1. **运行时源码**：`defineTool({ name })`、`vendor/cordis/src/registry.ts`、`events.ts`、`packages/boot/app-boot/src/profile.ts`、preset YAML。
2. **已发布文档站**：`website/docs.ts` 映射到的页面。中文 locale 为 root，英文加 `/en/`。
3. **仓库 docs**：`docs/architecture.md`、cookbook、subsystems。其中未进 `subsystemGroups` 的（如 `extensions.md`）只是仓库文档。
4. **本 OKF bundle**：综述与工作流。`resource` 指向上面那些文件。
5. **包 README / Agent Notes**：决策记录或过时表面。Notes 不是当前权威。
6. **Creator skill**：只收与源码一致的 workflow 约束。工具动词过时则丢弃。
7. **社区 Discussions / 民间 doctor**：现象与复现可以参考，**不得写成官方合同**。

# 已确认的过时表面

- `tool-cordis` README 仍写五工具 / 单一 `cordis_inspect`。
- `editing-cordis-compositions` skill、TRUST 头、Agent Note 2026-07-08、`examples/web-cordis` 仍写 `cordis_mount`。
- `docs/cordis-primer.md` 的 dispatch 表缺 `bail`。以 `events.ts` + tutorial 04 为准。
- `docs/tool-catalog.md` 可能仍写 tool-cordis「Not in any shipped tree」——相对 `cordis` preset 过时。

# preview / rc

本生命周期与 Creator 更新已对照官方 tag `dsh-v0.1.0-rc.8`、SHA `141eb6fef83422698aef7a981029e843e8161534`（2026-08-20）。产品仍是 RC；checkout/tag 变化后先重新核对 `profile-boot.ts`、`plugin.ts`、Web patch、browser boot、client build/HMR 与 Creator composition skill，不能只等 `stale_after` 到期。
