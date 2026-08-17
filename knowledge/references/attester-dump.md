---
type: Reference
title: Attester for dshx dump
description: "检查 dump receipt：id 列表与重复 id。"
tags: [attester]
aliases: ["attester dump"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
---

# Verdict

1. `exit_code === 0`
2. `duplicate_ids` 为空
3. 若请求了 plugin，`ids` 包含该 id
4. 调用方不得把本 verdict 当成 boot 证明
