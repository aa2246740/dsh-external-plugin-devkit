---
type: Playbook
title: Persist files, not memory packages
description: 要留下来的能力必须写进 composition 文件，不是一次成功的 cordis_run。
tags: [persist, composition]
aliases: ["persist", "落盘", "deliverable"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: host-runner
    resource: packages/extensions/cordis-host-runner/README.md
    title: Storage stance
---

# 交付物

最小 scratch：

- `my-plugins/<id>/src/<id>.ts`
- `dshx.yml`（id / entry / marker）
- 便携 `cordis.yml`

要给别人装：按仓库 `docs/user/develop/basic/publish.md` 做成 bundle（`dsh.bundle`），再 `dsh plugin add`。注意 [duplicate-loader-id](../pitfalls/duplicate-loader-id.md) 与 [leftover-bundles](../pitfalls/leftover-bundles.md)。

# 不是交付物

- Creator 里 `cordis_define` 成功
- `standingKeyFor` 一次绿
- inspect 列表里短暂出现的 dyn-* 包
