---
type: Map
title: How this bundle follows Google OKF
description: 官方长文先消化再拆散；一概念一文件；index 做渐进披露；frontmatter 做廉价检索。
tags: [okf, index, digest]
aliases: [okf practice, best practice, 拆散, 消化, 索引, progressive disclosure, shatter]
status: stable
resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
generated: { by: dshx/grok-4.6, at: 2026-08-17T14:00:00Z }
stale_after: 2026-11-17
sources:
  - id: spec
    resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
    title: Open Knowledge Format v0.2
    author: team:google-cloud
  - id: blog
    resource: https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing
    title: How OKF can improve data sharing
  - id: trust
    resource: https://cloud.google.com/blog/products/data-analytics/okf-v0-2-adds-trust-signals
    title: OKF v0.2 trust signals
---

# Google 怎么说

OKF **不是**再做一个 RAG 服务。它是格式：目录里每篇 markdown 是一个概念，YAML frontmatter 做可查询字段，正文用结构（表 / 列表 / 代码），概念之间用普通链接连成图。[^spec]

Agent 的走法是 **渐进披露**，不是把整仓官方文档塞进上下文：

1. 读目录 `index.md`，只看有什么
2. 用 frontmatter（`type` / `title` / `description` / `tags` / `aliases`）判断这篇值不值得打开
3. 选中后再 `cat` 正文
4. 需要原文时跟随 `resource` / `sources` 进仓库文件

v0.2 把信任信号也放进 frontmatter：`sources`、`generated`、`verified`、`status`、`stale_after`。多数交互停在 frontmatter，不读正文。[^trust]

# 对本仓库的落地

官方 `docs/` 又长又重复。本 bundle **不转载**它们。做法：

| 步骤 | 做什么 | 不做什么 |
|---|---|---|
| 消化 | 从源码 + 已进站点的文档抽出一条可执行合同 | 把 `docs/subsystems/*.md` 整篇拷进来 |
| 拆散 | 一个文件只讲一件事（retry 和 timeout 分开） | 一篇「LLM 大全」 |
| 索引 | 根 index + 各目录 index + [symptoms](symptoms.md) | 只靠全文搜索碰运气 |
| 归因 | `sources` + 脚注 id 指回权威文件 | 把社区帖写成合同 |
| 检索 | `aliases` 写症状词；`kb search` 命中后必须 `kb cat` | 把 search snippet 当答案 |

# 本 bundle 的图

```
index.md
  → start-here.md
  → maps/symptoms.md          现象 → 概念
  → contracts/*               运行时合同（源码优先）
  → playbooks/*               外部 Agent 怎么做
  → pitfalls/*                已复现的砖
  → maps/official-sources.md  长文原件清单
  → computations/*            受控命令
```

冲突时见 [authority](../contracts/authority.md)。Skill / 过时 README / 社区 doctor **不是**合同。

[^spec]: Open Knowledge Format v0.2
[^trust]: OKF v0.2 trust signals
