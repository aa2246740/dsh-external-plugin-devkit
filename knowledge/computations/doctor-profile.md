---
type: Attested Computation
title: Doctor the local workshop
description: 环境、profile leftover bundles、dump 重复 id、会话孤儿 tool_call。
tags: [doctor, dshx]
aliases: ["doctor computation", "doctor", "dshx doctor", "workshop doctor"]
status: stable
runtime: dshx
parameters:
  - { name: profile, type: string, required: false }
executor:
  resource: /references/dshx-cli.md
  receipt: [exit_code, findings]
attester:
  resource: /references/attester-doctor.md
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
---

# Computation

```
pnpm dshx doctor [--profile @profile] --json
```

`leftover-bundle` 或 `duplicate-id` 为 error 则不得宣称 profile 健康。干净时这两项和 `orphan-tool-call` 会打 **ok**，不是省略。`:3080` 在听且不是本工具监督时为 **warn**，措辞与 `dshx status` 相同。本计算不是官方 `dsh doctor`。
