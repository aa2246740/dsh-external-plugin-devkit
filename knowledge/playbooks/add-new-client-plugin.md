---
type: Playbook
title: Activate a newly added client plugin
description: 新 client entry 可在同一 Host PID 内先热挂 Host 行，但已打开页面必须刷新/重开才能得到新 boot graph。
tags: [client, graph, reload, activation]
aliases: [new client, client reload, 新客户端插件, 页面刷新, new graph entry]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.7, sha: 99f6f02fecdb7dff40c3fbc9470f5907c29f74ca }
sources:
  - id: web-boot
    resource: packages/client/web/src/boot.tsx
    title: One-time page loader tree
  - id: client-hmr
    resource: packages/client/hmr/src/client/index.ts
    title: Graph frames are not adopted by an existing page
---

# 步骤

1. 构建并检查 `lib/client.js` lazy-CJS handoff；`dshx check <plugin>` 必须通过。
2. 让 package 从活动 profile 可解析。官方本地开发优先 `dsh plugin --profile <p> add <local-dir>` 产生 `link:`；旧 `file:` copy 才用 `sync-artifact`。
3. `dshx activation-plan <plugin> --change new-client`。
4. 通过被监听的 profile/home `cordis.patch.yml` 加稳定 Host entry；避免与 bundle 重复挂载。
5. 验证 Host entry 在同一 DSH PID 内 active。
6. 刷新/重开浏览器页面。旧页面只在 boot 时从 `window.__DSH_BOOT__` 建 loader tree，不采纳新 graph 行。
7. 验新 boot manifest 含 package id，再验真实 UI/行为。

# 完成标准

`HOST_TREE_ACTIVE`、页面刷新后的 `CLIENT_LOADED`、`VISUAL_BEHAVIOR_VERIFIED` 分别有证据。只看到 plugin add、patch 行或 HTTP 200 都不够。
