---
type: Pitfall
title: Relative plugin name in a --patch file
description: 相对 name 相对 profile 目录解析。写 ./src/foo.ts 再 pnpm dsh web --patch 会找不到模块。
tags: [patch, paths]
aliases: ["relative name", "baseUrl", "raw patch", "pnpm dsh --patch"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: first-plugin
    resource: docs/user/develop/basic/index.md
    title: Absolute plugin path
---

git 里保留相对名以便移植。启动必须经 `dshx start` / `verify`，让工具写出绝对 overlay。不要把 `/workspace/...` 提交进仓库。见 [patch-overlay](../contracts/patch-overlay.md)。
