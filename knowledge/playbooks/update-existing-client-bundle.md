---
type: Playbook
title: Hot-reload an existing client bundle
description: 已在当前页面 loader tree 中的 client 插件，重建 lib/client.js 后走 client HMR；不重启 Host。
tags: [client, hmr, browser, bundle]
aliases: [existing client, client HMR, rebuilt, client hot reload, 前端热更新]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.7, sha: 99f6f02fecdb7dff40c3fbc9470f5907c29f74ca }
sources:
  - id: client-hmr-host
    resource: packages/client/hmr/src/index.ts
    title: Bundle hash watcher and SSE
  - id: client-hmr-browser
    resource: packages/client/hmr/src/client/index.ts
    title: Browser fiber reload
---

# 前提

- 这个 package id 已在当前页面启动时的 loader tree 中。
- `exports["./client"]` 指向构建后的 `lib/client.js`。
- 产物使用 `window.__ModuleLoader__.load({ id, factory })` lazy-CJS handoff。
- Web 的 client HMR 行正在运行，并且构建/watch 真正改写了产物 hash。

# 步骤

1. `dshx activation-plan <package> --change client`。
2. 重建 `lib/client.js`。若 profile 使用旧式 `file:` copy，再跑 `dshx sync-artifact <dir>`；`link:` 不需要 remove/add。
3. 不重启 Host，不刷新页面，观察该 id 的 `rebuilt` 事件。
4. 在同一页面验证新文案/交互/DOM 或截图，不能只看 bundle 文件时间。

# 限制

client HMR 会替换插件 fiber 和其样式，插件 React 本地状态会丢失；失败 reload 没有自动回滚。若 HMR 报 unknown entry，走 [新增 client](add-new-client-plugin.md)，不要继续声称热更新成功。
