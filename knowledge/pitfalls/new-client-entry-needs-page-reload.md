---
type: Pitfall
title: A new client entry needs a page reload
description: Host graph 可变化，但当前浏览器页面忽略 graph SSE 增量；新 client package 需刷新/重开页面获取新 boot manifest。
tags: [client, browser, graph, reload]
aliases: [client reload, refresh page, new client missing, 新插件页面不显示, graph frame]
status: stable
verified_against: { tag: dsh-v0.1.1-rc.2, sha: b150a551b8d465e31e418e1b2eaf5e79bbb7d28e }
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

# 根因

页面启动时从 `__DSH_BOOT__` 建一次 loader tree；RC2 的官方 Host 以 `globalThis["__DSH_BOOT__"]` 注入它。当前 client HMR 只处理已知 id 的 `rebuilt`，不会把后续 graph 新行加进该页面。

# 修复

刷新/重开页面，确认新 boot manifest 含 package id，再验 UI。刷新页面不是重启 DSH Host；两者不要混写。
