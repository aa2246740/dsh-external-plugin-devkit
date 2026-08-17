---
type: Reference
title: Open Knowledge Format v0.2
description: Google 的 markdown + YAML frontmatter 知识包格式。本 bundle 按此编写。
tags: [okf]
aliases: [okf, open knowledge format, google okf]
status: stable
resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: spec
    resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
    title: OKF SPEC.md v0.2
    author: team:google-cloud
---

# 本 bundle 用到的约定

- 每个概念一篇 `.md`，YAML frontmatter，必有 `type`
- `index.md` / `log.md` 是保留名
- 根 `index.md` 声明 `okf_version: "0.2"`
- 链接用 bundle 根相对 `/…` 或相对路径
- `sources` + 脚注 id 做逐条归因
- `generated.by` 用 `dshx/grok-4.6`
- 本 bundle 额外用 `aliases`（OKF 允许自定义键）给症状检索
- Attested Computation 带 `runtime` / `parameters` / `executor` / `attester`

消费者（人和 Agent）用 `dshx kb` 遍历，不需要 SDK。走法见 [okf-practice](/maps/okf-practice.md)。
