---
type: Attested Computation
title: Verify a scratch plugin actually boots
description: 静态检查 + dump-config 含 id + 真实 spawn 后日志出现 marker。
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
pnpm dshx verify @plugin [--profile @profile] [--port @port] [--keep]
```

Agent 只能填已声明的参数。成功：exit 0，且 findings 含 `boot-marker` 为 ok。dump-config 单独为 0 不算成功。
