---
type: Pitfall
title: Installed is not live
description: dsh plugin add、bundle 清单或 artifact copy 成功只说明持久安装/下次启动状态，不能证明当前 Host 或浏览器已激活。
tags: [install, activation, bundle, ship]
aliases: [插件装了没生效, installed not live, plugin add not active, artifact synced, LIVE_ACTIVATION_UNPROVEN]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.7, sha: 99f6f02fecdb7dff40c3fbc9470f5907c29f74ca }
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

前四项最多证明 profile 磁盘状态。运行中 Host 不会因此重新读取 bundle manifest；浏览器还另有 boot graph 和 client HMR 生命周期。

# 修复

先读 [live activation](../contracts/live-activation.md)，再用 `activation-plan --change ...` 选分支。报告时把 `ARTIFACT_SYNCED`、`NEXT_BOOT_REGISTERED`、`HOST_TREE_ACTIVE`、`CLIENT_LOADED` 分开。
