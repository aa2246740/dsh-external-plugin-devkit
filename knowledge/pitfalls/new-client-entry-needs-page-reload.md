---
type: Pitfall
title: Verify graph synchronization before reloading a new client
description: RC2 client HMR 可同步新 graph 行；新插件不显示时先查传输与加载状态，再决定是否刷新。
tags: [client, browser, graph, reload]
aliases: [client reload, refresh page, new client missing, 新插件页面不显示, graph frame]
status: stable
verified_against: { tag: dsh-v0.2.0-rc.2, sha: 639ed015397290b3745d163aafe02ffee4aa3f84 }
sources:
  - id: client-hmr
    resource: packages/client/hmr/src/client/index.ts
    title: Existing-page HMR event handling
  - id: web-boot
    resource: packages/client/web/src/boot.ts
    title: Initial loader-tree construction
---

# 现象

Host entry 已在同一 PID 内 active，新 `lib/client.js` 也存在，但已打开页面没有新卡片/slot；client HMR 可能说 unknown entry。

# 排查

RC2 client HMR 同时处理 graph 和 rebuilt。graph 帧调用 `entries.sync(frame.graph)`，可将新行加入当前页面；旧版要求一律刷新已不适用于这条路径。

先确认实际 Host 版本、活动 client-hmr provider、当前页面的事件连接和插件加载错误。构建或 Cordis 依赖声明错误要修源码，刷新不能代替修复。

# 验证

保持当前页面，等待新行加载并操作功能。只有 graph 传输不可用时才刷新/重开，并注明没有证明同页热加载。Host manifest 存在不是页面加载证据。参见 [新增 client](../playbooks/add-new-client-plugin.md)。
