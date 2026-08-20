---
type: Playbook
title: Activate a newly added client plugin
description: 新 client entry 可在同一 Host PID 内先热挂 Host 行，但已打开页面必须刷新/重开才能得到新 boot graph。
tags: [client, graph, reload, activation]
aliases: [new client, client reload, 新客户端插件, 页面刷新, new graph entry]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.8, sha: 141eb6fef83422698aef7a981029e843e8161534 }
sources:
  - id: web-boot
    resource: packages/client/web/src/boot.ts
    title: One-time page loader tree
  - id: client-hmr
    resource: packages/client/hmr/src/client/index.ts
    title: Graph frames are not adopted by an existing page
---

# 步骤

1. 先读 [RC8 external client build](../contracts/client-build.md)，构建并检查 `lib/client.js` lazy-CJS handoff；`dshx check <plugin>` 必须通过。
2. `dshx activation-plan <plugin> --change new-client`。
3. 在 Creator Mode+ 内调用唯一固定工具 `dshx_activate_new_client({ name })`；在外部 CLI 使用 `dshx activate-new-client <name> --profile web --port <当前端口>`。该动作先用官方 `dsh plugin` 产生/修复 `link:`，确认 package 与 `lib/client.js` 从活动 profile 可解析，最后才写或重触发 watched patch。
4. 命令成功标准是退出 0 且同时报告 `HOST_TREE_ACTIVE` 与 `CLIENT_MANIFEST_PRESENT`。失败时不得自己改 profile manifest/patch、补跑安装或重启 Host；只在 blocker 明说可重试时重试。若错误命名旧顺序留下的 pre-install resolution cache，交给外部 supervisor 一次性重启并复验；这不是正常 new-client 流程的要求。
5. Creator+ 返回的 `hostPid` 是调用工具的当前 DSH Host PID；命令返回即证明过程中没有重启该 Host。
6. 刷新/重开浏览器页面。旧页面只在 boot 时从 `window.__DSH_BOOT__` 建 loader tree，不采纳新 graph 行。
7. 验新 boot manifest 含 package id，再验真实 UI/行为。

# 完成标准

`HOST_TREE_ACTIVE` / `CLIENT_MANIFEST_PRESENT`、页面刷新后的 `CLIENT_LOADED`、`VISUAL_BEHAVIOR_VERIFIED` 分别有证据。只看到 plugin add、patch 行或 HTTP 200 都不够。
