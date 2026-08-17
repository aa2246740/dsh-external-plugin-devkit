---
type: Reference
title: Attester for dshx verify
description: 确定性检查 verify receipt。禁止用模型自己的成功叙述代替。
tags: [attester]
aliases: ["attester verify"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
---

# Verdict

通过当且仅当：

1. `exit_code === 0`
2. findings 中存在 `code=boot-marker` 且 `level=ok`
3. web profile 时存在 `code=http` 且 `level=ok`
4. 不存在 `level=error` 的 finding

dump-config 单独成功不足以通过。
