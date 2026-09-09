---
type: Playbook
title: Hot-reload an existing client bundle
description: 已在当前页面 loader tree 中的 client 插件，重建 lib/client.js 后走 client HMR；不重启 Host。
tags: [client, hmr, browser, bundle]
aliases: [existing client, client HMR, rebuilt, client hot reload, 前端热更新]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.8, sha: 141eb6fef83422698aef7a981029e843e8161534 }
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
- 外部 RC8 package 使用 [dshx externalClientBundle](../contracts/client-build.md)，不直接导入只扫描 `packages/*/*` 的官方 workspace preset。

# 步骤

1. `dshx activation-plan <package> --change client`。
2. 重建 `lib/client.js`。若 profile 使用旧式 `file:` copy，再跑 `dshx sync-artifact <dir>`；`link:` 不需要 remove/add。
3. 不重启 Host，不刷新页面，观察该 id 的 `rebuilt` 事件。
4. 在同一页面验证新文案/交互/DOM 或截图，不能只看 bundle 文件时间。

# 限制

client HMR 会替换插件 fiber 和其样式，插件 React 本地状态会丢失；失败 reload 没有自动回滚。若 HMR 报 unknown entry，走 [新增 client](add-new-client-plugin.md)，不要继续声称热更新成功。

## Repair build failures without changing source ownership

An authorized plugin fix includes necessary package-local build configuration repairs. Preserve the resolved source directory, branch and local edits. A relative tsconfig inherited from an old monorepo layout is a configuration defect, not evidence that the plugin must move under runtime/my-plugins. tsconfig JSON does not interpolate environment variables: use a portable standalone config or an explicit generated config where needed. Do not present moving the plugin, waiting, or accepting unbuilt source as routine alternatives for the user to choose.

When the exact file lies outside the session workspace, request its normal tool-level approval with the concrete repair. Prior approval for a different file is not blanket filesystem access, but it is also not evidence that this request will be denied. Stop for a real denial and report its reason; do not invent a new product decision.

DSHX check is a static contract check and may inspect an old lib/client.js. A failed build remains blocking even if check passes. Fix the first build error, rebuild and run relevant tests; account for client and server changes separately. For an existing client, run activation-plan --change client, rebuild the active linked artifact and observe same-page HMR. Use the fixed hot-reload path for changed server artifacts. Completion requires the user's actual workflow in the running Host.
