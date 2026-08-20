---
type: Attested Computation
title: Verify a scratch plugin in an isolated cold boot
description: 没有现存 supervised Host 时，静态检查 + dump-config + 独立 spawn marker/HTTP；不证明 live activation。
tags: [verify, dshx]
aliases: ["verify computation"]
status: stable
runtime: dshx
parameters:
  - { name: plugin, type: string, required: true }
  - { name: profile, type: string, required: false }
  - { name: port, type: integer, required: false }
  - { name: keep, type: boolean, required: false }
executor:
  resource: /references/dshx-cli.md
  receipt: [exit_code, findings, log_tail, marker_seen, http_ok]
attester:
  resource: /references/attester-verify.md
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
---

# Computation

```
dshx verify-boot @plugin [--profile @profile] [--port @port] [--keep]
```

Agent 只能填已声明的参数。成功：exit 0，且 findings 含 `boot-marker` 为 ok。已有 supervised Host 时必须拒绝且 PID 不变；dump-config 单独为 0 不算成功，cold boot 也不等于 current-host activation。
