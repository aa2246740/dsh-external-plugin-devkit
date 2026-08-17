---
type: Pitfall
title: dump-config exit 0 on a profile that cannot boot
description: "dump 不 import 条目，重复 id、坏 insert name、dangling file 依赖都能过。"
tags: [dump-config]
aliases: ["false negative", "dump 过了"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: disc-1496
    resource: https://github.com/deepseek-ai/deepseek-harness/discussions/1496
    title: Plugin-install guardrails / no dsh doctor
---

# 合同

dump 成功 ≠ 能 boot。#1496 把「No `dsh doctor` / `dsh check`」列为官方缺口。

`dshx verify` 补的就是这个缺口的 scratch 子集，不是官方 Doctor。
