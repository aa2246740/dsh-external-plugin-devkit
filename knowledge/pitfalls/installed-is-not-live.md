---
type: Pitfall
title: Installed is not live
description: 磁盘安装、Host 激活和页面功能需要各自的证据；RC2 manager applied 也不能代替 UI 验收。
tags: [install, activation, bundle, ship]
aliases: [插件装了没生效, installed not live, plugin add not active, artifact synced, LIVE_ACTIVATION_UNPROVEN]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.8, sha: 141eb6fef83422698aef7a981029e843e8161534 }
sources:
  - id: plugin-cli
    resource: apps/cli/src/plugin.ts
    title: Plugin command writes profile state
  - id: profile-boot
    resource: apps/cli/src/profile-boot.ts
    title: Bundle layers captured at boot
---

# 误判链

```text
pnpm add 成功
→ package.json 有依赖
→ dsh.profile.bundles 有名字
→ lib/ 已复制
→ 所以当前页面已生效   # 错
```

前四项最多证明 profile 磁盘状态。RC2 profile HMR 可以重读 bundle，但必须核对官方 manager 的 application 结果、同 PID 行状态，以及页面加载和功能。

反过来也不能因为 dependency 写进了 `package.json` 就机械要求重启。依赖是解析前提；RC2 新 bundle 可同 PID 重组，首次 client 可通过 graph 同步进入当前页面。运行时能力未知时保持未确定。

# 修复

先读 [live activation](../contracts/live-activation.md)，再用 `activation-plan --change ...` 选分支。报告时把 `ARTIFACT_SYNCED`、`NEXT_BOOT_REGISTERED`、`HOST_TREE_ACTIVE`、`CLIENT_LOADED` 分开。
