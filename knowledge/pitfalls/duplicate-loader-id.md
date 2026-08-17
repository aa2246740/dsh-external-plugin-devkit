---
type: Pitfall
title: duplicate loader entry id after dsh plugin add
description: reconcilePlugins 把 bundle 依赖提升进 stacks，旧 insert 仍在。dump-config 查不出。
tags: [plugin-add, boot]
aliases: ["duplicate loader", "duplicate id"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: disc-1404
    resource: https://github.com/deepseek-ai/deepseek-harness/discussions/1404
    title: duplicate loader entry id
---

# 现象

下次真实 boot：`duplicate loader entry id: better-sidebar`（也有 `modlens`）。

# 触发

原先只靠 `cordis.patch.yml` 的 `insert` 加载、且声明了 `dsh.bundle` 的 `file:` 依赖，再 `dsh plugin --profile web add <pkg>`。

# 修复

从 `cordis.patch.yml` 删掉现已多余的 insert id。`dshx dump` / `doctor` 会数组成树里重复的 `id:`。
