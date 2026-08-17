---
type: Map
title: Published docs-site routes
description: website/docs.ts 才是文档站合同。未列入的仓库 md 不是站点页。
tags: [map, docs]
aliases: ["docs.ts", "website", "文档站"]
status: stable
resource: website/docs.ts
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
---

产品页：https://deepseek.com/harness/en/
开发文档：https://deepseek-harness.github.io/deepseek-harness/en/guide/quickstart
中文 locale 为 root，去掉 `/en/`。

| 仓库源 | 英文站 |
|---|---|
| `docs/user/guide/index.md` | `/en/guide/quickstart` |
| `docs/user/develop/basic/*` | `/en/develop/basic/…` |
| `docs/user/develop/framework/*` | `/en/develop/framework/…` |
| `docs/cordis-tutorial/*` | `/en/develop/cordis-tutorial/…` |
| `docs/architecture.md` | `/en/reference/` |
| `docs/subsystems/*`（仅 subsystemGroups） | `/en/reference/subsystems/…` |
| `docs/cookbook/*`、`docs/cordis-api/*` | `/en/reference/cookbook\|cordis-api/…` |

`extensions.md` / `feedback.md` / `attachment.md` 未进 subsystemGroups。文档站 **没有**「Creator Mode」专页。
