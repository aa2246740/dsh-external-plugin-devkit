---
type: Pitfall
title: Creator packages vanish after restart
description: 这是官方合同，不是缺陷。define/run 只活在进程内存。
tags: [creator, memory]
aliases: ["cordis_define", "memory", "重启消失"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: host-runner
    resource: packages/extensions/cordis-host-runner/README.md
    title: Registry is process memory
  - id: disc-870
    resource: https://github.com/deepseek-ai/deepseek-harness/discussions/870
    title: Users treating memory packages as session plugins
---

host-runner 原文：registry 是进程内存；session 日志只带 define 元数据，从不带代码；重启后没有定义是合法的。

要留下：写文件 + `dshx check`，按需 `verify-boot`，再按 [live activation](../contracts/live-activation.md) 选择 profile patch / package 安装与运行时验收。见 [persist-files](../playbooks/persist-files.md)。
