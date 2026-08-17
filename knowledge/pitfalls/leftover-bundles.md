---
type: Pitfall
title: leftover dsh.profile.bundles after failed remove
description: pnpm 非零退出时 reconcile 不跑，bundles 残留，profile 永久无法启动。
tags: [plugin-remove, boot]
aliases: ["leftover", "plugin remove", "cannot resolve profile bundle"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: disc-917
    resource: https://github.com/deepseek-ai/deepseek-harness/discussions/917
    title: cannot resolve profile bundle
---

# 现象

`cannot resolve profile bundle`。官方提示的 `dsh plugin install` / `ls` 去不掉该行。

# 根因

依赖已改写但 `dsh.profile.bundles` 残留。`reconcilePlugins` 只在 `exitCode===0` 跑。

# 修复

手删 `$DSH_HOME/profiles/<name>/package.json` 里那条 bundles。`dshx doctor` 把「在 bundles 但不在 dependencies、也不是模板 bundle」标成 `leftover-bundle`。
