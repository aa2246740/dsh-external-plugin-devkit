---
type: Runtime Contract
title: dump-config is not a boot
description: dump 离线拼树、不挂 Loader、不求值 !!js。退出 0 不能证明真实启动。
tags: [dump-config, verification]
aliases: ["dump-config", "dump", "假阴性"]
status: stable
resource: apps/cli/src/dump-config.ts
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: dump-src
    resource: apps/cli/src/dump-config.ts
    title: runDumpConfig
  - id: cli-ref
    resource: apps/cli/reference/README.md
    title: Inspect the composed tree
  - id: disc-1496
    resource: https://github.com/deepseek-ai/deepseek-harness/discussions/1496
    title: No dsh doctor / dump false negative
---

# 它做什么

不启动 Loader / 插件进程，不求值 `!!js`，把将要 `boot()` 的 entry 树打成可再加载 YAML。

- `--dump-default-config`：只 bundle 层，**绝不解析** profile 的 `cordis.patch.yml`
- `--dump-config`：再叠 profile → `$DSH_HOME/cordis.patch.yml` → `--patch`
- 两 dump 互斥；dump 行上残留 app 参数会被拒
- stdout 按来源分段，`# == …` 点名文件
- 命不中的 patch 只在 stderr 打警告，**不算 dump 失败**

# 它看不见什么

- Loader 激活失败、缺失 inject、isolate 碰撞
- `!!js` 求值结果（`dshHomePath('sessions')` 会原样打印）
- `runProfile` 追加的 launcher overlay（shipped presets 根、telemetry disable）
- `duplicate loader entry id` 要到真实 boot 才炸——除非你像 `dshx dump` 那样自己数 id

# 怎么用

`dshx dump <plugin>`：确认 id 出现在树上，并显式警告这不是 boot。
`dshx verify <plugin>`：dump + 真启动 + marker。见 [verify-boot](../playbooks/verify-boot.md) 与 [dump-false-negative](../pitfalls/dump-false-negative.md)。
