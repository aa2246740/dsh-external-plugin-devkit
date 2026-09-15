---
type: Playbook
title: Activate a newly added client plugin
description: 新 client entry 可在同一 Host PID 内先热挂 Host 行，但已打开页面必须刷新/重开才能得到新 boot graph。
tags: [client, graph, reload, activation]
aliases: [new client, client reload, 新客户端插件, 页面刷新, new graph entry]
status: stable
verified_against: { tag: dsh-v0.1.1-rc.2, sha: b150a551b8d465e31e418e1b2eaf5e79bbb7d28e }
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
3. 在 Creator Mode+ 内调用固定工具 `dshx_activate_new_client({ name })`；在外部 CLI 使用 `dshx activate-new-client <name> --profile web --port <当前端口>`。该动作先用官方 `dsh plugin` 产生/修复 `link:`，确认 package 与 `lib/client.js` 从活动 profile 可解析，再由限定文件的官方 HMR 处理未挂载插件的导入缓存，清理临时观察器后写入或重触发 watched patch。已挂载插件跳过导入准备，Host PID 保持不变。
4. 命令成功标准是退出 0 且同时报告 `HOST_TREE_ACTIVE` 与 `CLIENT_MANIFEST_PRESENT`。若失败，修正报错指向的源码、配置或访问问题，再调用同一工具；其他已授权步骤继续进行。源码改好后的旧导入失败缓存由工具处理，用户无需为此安排 Host 重启。临时 HMR 清理未被证实时，按错误中的事务目录排查。
5. Creator+ 返回的 `hostPid` 是调用工具的当前 DSH Host PID；命令返回即证明过程中没有重启该 Host。
6. 刷新/重开浏览器页面。旧页面只在 boot 时从 `__DSH_BOOT__` 建 loader tree（RC2 注入形式为 `globalThis["__DSH_BOOT__"]`），不采纳新 graph 行。
7. 验新 boot manifest 含 package id，再验真实 UI/行为。

# 完成标准

`HOST_TREE_ACTIVE` / `CLIENT_MANIFEST_PRESENT`、页面刷新后的 `CLIENT_LOADED`、`VISUAL_BEHAVIOR_VERIFIED` 分别有证据。只看到 plugin add、patch 行或 HTTP 200 都不够。
