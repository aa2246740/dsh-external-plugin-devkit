---
type: Runtime Contract
title: Testing policy for user-visible plugins
description: 用户可见插件要做真实 composition 测试；手搓 ctx.plugin 不够。
tags: [testing, composition]
aliases: ["testing", "composition test"]
status: stable
resource: docs/testing.md
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: testing
    resource: docs/testing.md
    title: Testing policy
---

# 对 scratch 插件意味着什么

官方政策：用户可见插件经 Loader 启动测试用 `cordis.yml`，断言模型可见的 request/log、持久状态或用户可见输出。

`dshx verify-boot` 是这条政策的隔离 cold-boot 缩小版：

1. 静态插件形态（namespace function 或 official default object/class）
2. dump-config 里看得到 id（必要但不充分）
3. 真的 spawn `dsh`，等 `apply` 的 console marker，web 再等 HTTP

它 **不** 替代日后的 composition/live/browser 测试，也不声称覆盖率。
