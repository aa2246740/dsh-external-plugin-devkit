---
type: Reference
title: Attester for knowledge retrieval
description: kb lint 的检索夹具必须零 error；warning 不挡门。
tags: [attester, okf]
aliases: [attester-search, retrieval attester]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T14:00:00Z }
stale_after: 2026-11-17
---

# Verdict

Receipt 来自 `dshx kb lint`：

- `exit_code === 0`
- 输出里没有 `search "…" missed` / `first hit was`

缺 aliases 只是 warning，不构成失败。检索夹具失败 = bundle 对外部 Agent 不可用。
