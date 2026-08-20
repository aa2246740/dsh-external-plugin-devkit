---
type: Attested Computation
title: Knowledge retrieval fixtures
description: 实验里失败的那些查询必须能命中拆散后的概念，且 timeout/retry 排在 CLI 噪音前面。
tags: [okf, search, dshx]
aliases: [retrieval, kb search, fixtures]
status: stable
runtime: dshx
parameters: []
executor:
  resource: /references/dshx-cli.md
  receipt: [exit_code, fixture_errors]
attester:
  resource: /references/attester-search.md
generated: { by: dshx/grok-4.6, at: 2026-08-17T14:00:00Z }
stale_after: 2026-11-17
---

# Computation

```
dshx kb lint
```

`kb lint` 会跑 `RETRIEVAL_FIXTURES`。Agent 不得改查询词来让 lint 变绿；缺概念就补概念和 `aliases`。

必中（节选）：`retry` → `contracts/llm-retry`；`timeout` 的第一命中是 `contracts/llm-timeout`；`headless` → `playbooks/headless-boot`；`default export` → `contracts/plugin-forms`；`check` → `playbooks/check-plugin`；`doctor` → `computations/doctor-profile`。
