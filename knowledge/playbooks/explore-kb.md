---
type: Playbook
title: How an agent explores this OKF bundle
description: "渐进披露：index → start-here → 链接 → kb search。不要盲搜整仓。"
tags: [okf, agent]
aliases: [explore, kb, search, cat, 怎么查]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: okf
    resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
    title: OKF v0.2
---

# 算法

1. `dshx kb` 或读 `tools/dshx/knowledge/index.md`
2. 打开 [start-here](../start-here.md)
3. 有具体现象就打开 [symptoms](../maps/symptoms.md)，不要先盲搜 `docs/`
4. `dshx kb search <词>` 只用来找 id
5. **立刻** `dshx kb cat <id>`。停在 search snippet 上 = 没读合同
6. 需要原文时跟随该篇 `resource` 和 `sources` 进仓库文件
7. 改完 bundle 后 `dshx kb lint`（含检索夹具：`retry` / `timeout` 必须能中）

# 链接规则

- `/contracts/plugin-forms.md` 是 bundle 根相对（OKF 推荐）
- `./other.md` 是相对当前文件
- 断链不视为 bundle 非法；lint 会警告

# 信任

frontmatter 的 `generated` / `verified` / `status` / `stale_after` 按 OKF v0.2。无 `verified` = unverified。社区篇的 type 是 `Community Note`，不得当运行时合同。
