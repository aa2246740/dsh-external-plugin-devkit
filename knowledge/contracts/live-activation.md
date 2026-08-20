---
type: Runtime Contract
title: External plugin live activation matrix
description: ship 只同步产物；配置热重组、bundle 下次启动、用户 preset 新会话、已有客户端 HMR、新客户端刷新页面、服务端重启和 artifact-only 是七种不可混写的状态。
tags: [activation, hmr, hot-reload, plugin, lifecycle]
aliases: [HMR, hot reload, hot-reload, 热重载, 热插拔, 不重启, live activation, cordis.patch.yml, client reload, bundle, manifest, user preset, Creator Mode, restart]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.8, sha: 141eb6fef83422698aef7a981029e843e8161534, date: 2026-08-20 }
sources:
  - id: profile-boot
    resource: apps/cli/src/profile-boot.ts
    title: Profile composition and watched user patches
  - id: plugin-cli
    resource: apps/cli/src/plugin.ts
    title: Profile dependency and bundle reconciliation
  - id: cordis-hmr
    resource: docs/cordis-tutorial/06-composition-and-hmr.md
    title: Cordis composition and HMR
  - id: web-bundle
    resource: packages/bundle/web-app/cordis.patch.yml
    title: Shipped Web HMR configuration
  - id: client-hmr
    resource: packages/client/hmr/src/client/index.ts
    title: Browser client HMR receiver
  - id: web-boot
    resource: packages/client/web/src/boot.ts
    title: Browser boot graph construction
  - id: preset-discovery
    resource: packages/preset/agent-presets/src/discovery.ts
    title: User preset roots are re-read on every roster call
  - id: preset-session
    resource: packages/preset/agent-presets/src/session.ts
    title: Session preset generation is a logged session fact
  - id: preset-seat
    resource: packages/client/ui-agent-preset/src/client/seat-store.ts
    title: WebUI next-session preset selection
---

# 第一条规则

`dshx sync-artifact` / `ship` 只证明产物已同步。它不证明当前 Host 已挂载插件，也不证明浏览器已加载客户端。

Creator+ Guardian 只改变失败后的外部恢复能力，不改变下面任何 activation 分支：
它不能把 artifact 变成 live、不能让新 client 免刷新，也不能把 Host 恢复冒充 UI 验收。
并发认领与恢复顺序见 [creator-guardian](creator-guardian.md)。

# 七种状态不可互换

| 变更面 | 官方机制 | 当前 Host | 已打开页面 | 应做什么 |
|---|---|---|---|---|
| profile/home `cordis.patch.yml` | 精确路径 watcher 重新合成配置树 | 同 PID 内按稳定 `id` mount/unmount/reconfigure | 新增 client 行不会自动进入旧页面 | 等热重组并验 Host；新增 client 再刷新页面 |
| profile `package.json` / `dsh.profile.bundles` | `dsh plugin` 写依赖和下次启动 bundle 清单 | 不重新读 manifest/bundle 层 | 不生效 | 受控重启当前宿主后验证 |
| 用户 `.agent-presets/<id>` | roster 每次调用都重扫用户根；preset 在 session scope 挂载 | 无需重启；preset 引用的普通依赖须可解析 | 已加载 roster 可能仍是缓存；已开始会话保留其记录的 generation | 必要时刷新/重开页面，并在新会话或空白会话中验 preset 工具/提示词 |
| 已在页面 graph 中的 `lib/client.js` | client HMR 发现 hash 变化并发 `rebuilt` | 无需重启 | 同一页面换 fiber；插件 React 本地状态丢失 | 重建产物，观察 rebuilt 与 UI 行为 |
| 新增 client entry | Host 配置树可热挂；页面 graph 只在 boot 建一次 | 可同 PID 激活 Host 行 | 旧页面忽略 graph 增量 | 刷新/重开页面，再验 client/UI |
| server module 源码/产物 | 仅在明确配置 module-HMR root 时才可热换 | Web 默认不承诺 module HMR | 不适用 | 除非该面已有专项测试，否则受控重启 |
| 仅同步 artifact | 文件/链接存在且内容哈希一致 | 未证明 | 未证明 | 先分类真正变更面，再进入对应分支 |

`dsh web` 的兜底 HMR 使用 `root: []`，目的是保证用户 patch 可热更新，不是任意服务端模块热重载。Web bundle 还显式禁用了共享 server-module HMR 行。

RC8 把浏览器入口从 `boot.tsx` 重构为 `boot.ts`，但生命周期结论没有反转：
页面仍在启动时取得初始 graph，已有页面不会凭 Host graph 增量创建一个全新的
client row。另一个 RC8 行为变化是 `dsh web` 默认打开浏览器；自动化与 dshx
supervisor 必须传 `--no-open`，这与插件是否需要页面 reload 是两件事。

# 决策顺序

1. 先说清改的是 `patch`、`manifest`、`preset`、已有 `client`、`new-client`、`server` 还是仅 `artifact`。
2. 跑 `dshx activation-plan <plugin> --change <branch>`，读取磁盘安装/合成事实。`dump-config` 仍只是离线树，不是运行中 Loader 证明。
3. 执行对应 playbook。只有 `manifest` / `server` 分支默认需要重启 Host。
4. Host-tree 与 browser/UI 分别验证；不得把一次 copy、HTTP 200 或启动 marker 写成全链路成功。

# 证据用语

按层报告：

```text
SOURCE_BUILT
ARTIFACT_SYNCED
NEXT_BOOT_REGISTERED
PRESET_ROSTER_VISIBLE
PRESET_SESSION_ACTIVE
HOST_TREE_ACTIVE
CLIENT_MANIFEST_PRESENT
CLIENT_LOADED
VISUAL_BEHAVIOR_VERIFIED
```

只报告实际观察到的层。`ARTIFACT_SYNCED; LIVE_ACTIVATION_UNPROVEN` 是合法结果，不是失败包装成成功。

# 禁止泛化

- “DSH 插件都能热插拔”——错误；只有具体生命周期分支可以下结论。
- “改完插件就重启”——错误；patch 与已有 client HMR 不需要 Host 重启。
- “plugin add 成功即 live”——错误；它只改 profile 的持久状态和下次启动组合。
- “新增 client 后旧页面会自己出现”——错误；当前页面不采纳 graph 新行。

# 分支 playbook

- [热改 Host 配置行](../playbooks/hot-config-entry.md)
- [激活用户 preset](../playbooks/activate-user-preset.md)
- [更新已有 client bundle](../playbooks/update-existing-client-bundle.md)
- [新增 client 插件](../playbooks/add-new-client-plugin.md)
- [更新 server module](../playbooks/restart-server-plugin.md)
