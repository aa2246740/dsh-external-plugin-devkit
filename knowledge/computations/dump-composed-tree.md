---
type: Attested Computation
title: Dump the composed entry tree
description: 调用官方 dump-config 并解析 id。退出 0 仍须带 not-boot 警告。
tags: [dump, dshx]
aliases: ["dump computation"]
status: stable
runtime: dshx
parameters:
  - { name: plugin, type: string, required: false }
  - { name: profile, type: string, required: false }
executor:
  resource: /references/dshx-cli.md
  receipt: [exit_code, ids, duplicate_ids]
attester:
  resource: /references/attester-dump.md
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
---

# Computation

```
dshx dump @plugin [--profile @profile] --json
```

若提供 plugin，ids 必须包含该 id。duplicate_ids 必须为空。不得把 exit 0 解释成 boot 成功。
