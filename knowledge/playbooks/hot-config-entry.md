---
type: Playbook
title: Hot-reconcile a Host config entry
description: 用 DSH 正在监听的 profile/home cordis.patch.yml 热挂、热卸或重配 Host 行；保持 DSH PID 不变。
tags: [patch, hmr, host, config]
aliases: [hot config, cordis.patch.yml, 不重启, 热挂载, hot mount, config reconcile]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.8, sha: 141eb6fef83422698aef7a981029e843e8161534 }
sources:
  - id: profile-boot
    resource: apps/cli/src/profile-boot.ts
    title: Watched user patches
  - id: app-boot
    resource: packages/boot/app-boot/src/index.ts
    title: Transactional patch watcher
---

# 适用

你改的是 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 或 `$DSH_HOME/cordis.patch.yml` 的配置行，不是 bundle manifest，也不是 server module 文件。

# 步骤

1. `dshx activation-plan <plugin> --change patch`，确认包/入口能从活动 profile 解析。
2. 给 entry 使用稳定且唯一的 `id`。不要同时通过 bundle 和用户 patch 挂同一个插件。
3. 修改被监听的真实用户 patch；`.dshx/overlays/*.yml` 是一次性 `--patch` 启动参数文件，不是这条热更新面。
4. 等 watcher 事务重组。坏 YAML/坏配置应保留 last-good tree；先修错误，不要用重启掩盖。
5. 记录修改前后 DSH PID 相同，并用 plugin inventory、插件自有健康端点或可逆行为证明 entry mount/unmount。
6. 如果这是一个新 client entry，继续 [新增 client 插件](add-new-client-plugin.md) 的页面刷新步骤。

# 完成标准

稳定 `id` 的目标 Host 行按预期生效，DSH PID 未变化；只看到磁盘 patch 或 `dump-config` 行不算完成。
