---
type: Runtime Contract
title: External plugin live activation matrix
description: ship 只同步产物；区分配置、bundle、preset、客户端、服务端热替换和 artifact，缺少激活证据不授权重启。
tags: [activation, hmr, hot-reload, plugin, lifecycle]
aliases: [HMR, hot reload, hot-reload, 热重载, 热插拔, 不重启, 做插件要重启整个 DeepSeek Harness 吗, live activation, cordis.patch.yml, client reload, bundle, manifest, user preset, Creator Mode, restart]
status: stable
verified_against: { tag: dsh-v0.2.0-rc.2, sha: 639ed015397290b3745d163aafe02ffee4aa3f84, date: 2026-09-30 }
sources:
  - id: profile-hmr
    resource: packages/boot/hmr/src/index.ts
    title: Profile package and patch reconciliation
  - id: public-plugin-manager
    resource: packages/boot/plugin-manager/src/index.ts
    title: Official installation and application outcomes
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

# 第一条规则：同 PID 默认

`dshx sync-artifact` / `ship` 只证明产物已同步。它不证明当前 Host 已挂载插件，也不证明浏览器已加载客户端。

按需要改变的运行时表面选分支。普通 profile dependency 只提供模块解析，不是重启证据。先读取实际运行时版本和当前 profile 的 HMR provider；只知道开发 checkout 是 RC2，不能替另一个未知 Host 作出激活结论。

RC2 有两处变化：profile HMR 监听 `package.json` 的 bundle 清单，重新读入 patch 并合成当前 Host；client HMR 收到 graph 帧后调用 `entries.sync(frame.graph)`，可在当前页面加载新行。旧版“bundle 一律下次启动、新 client 一律刷新”的结论不适用于 RC2 的这些配置。

# 七种状态不可互换

| 变更面 | 官方机制 | 当前 Host | 已打开页面 | 验证方式 |
|---|---|---|---|---|
| profile/home `cordis.patch.yml` | watcher 按稳定 id 重组配置 | 同 PID mount/unmount/reconfigure | RC2 client HMR 可同步 graph | Host 行和当前页面功能分别验证 |
| `dsh.profile.bundles` / package `dsh.bundle` | RC2 profile HMR 重读组合；官方 manager 等待结果 | 新 bundle 可同 PID `applied` | client graph 可同步 | 核对实际 manager 结果、Host PID 和插件行 |
| 用户 preset | registry 发现用户声明；会话保留自身 generation | 无需重启；普通依赖须可解析，进程资源须跨 generation 安全 | 现有会话不会变成新 preset 会话 | roster 可见，并在新/空白会话调用工具 |
| 已有 `lib/client.js` | client HMR 发 `rebuilt` | 无需重启 | 替换该 entry，局部状态可能丢失 | 同一页面操作改动功能 |
| 新增 client entry | Host 行激活后发送新 graph | 可同 PID 激活 | RC2 `entries.sync` 可加载新行 | 先看当前页面；传输不可用时才刷新并注明 |
| server module | 限定模块的官方 HMR | 受控替换保留 PID；无证据时未确定 | 客户端另验 | build/check 后运行 bounded hot-reload；失败不授权重启 |
| artifact / 普通 dependency | 文件、链接、模块解析准备 | 本步不证明变化 | 本步不证明变化 | 再选择真正的 activation 分支 |

只有实际 RC2 运行时和所需 provider 都已确认，计划才报告无需重启/刷新。旧版、未知运行时或无法读取的 profile 保持 `not-decided`。离线配置中的 provider 是能力前提，不是它在当前进程中健康运行的证明。

官方 manager 返回 `applied`、`restart-required`、`overridden`、`failed` 或 `cancelled`。更新已安装包代码可能返回 `restart-required`；新 bundle 激活不能据此一概要求重启。结果未知时先查同一个 request id，不重复提交安装。失败/待审批脚本/部分安装必须保留为未完成。

# 本地安装的两条入口

- 外部 Agent 安装声明了 `dsh.bundle.patch` 的本地包：`dshx plugin add <absolute-directory> --profile web|desktop --port <current-port>`。它使用当前 Host 的公开 plugin manager，不要求 npm；先读 [本地 bundle 安装](../playbooks/install-local-bundle.md)。
- Creator+ 开发 plain watched plugin：认领后调用固定 `dshx_activate_new_client`，由桥接取得当前 Web/Desktop Host 的私有能力。外部 Agent 不获取该票据。外部 Web watched plugin 保留 `activate-new-client` 路径。

同一插件不能同时由 bundle 和 watched patch 挂载。`dshx init --kind client` 默认创建 plain 开发插件；只有选择 bundle 交付路线时才添加 bundle 声明和插入 patch。

# 决策顺序

1. 明确 `patch`、`manifest`、`preset`、`client`、`new-client`、`server` 或 `artifact`。
2. 执行 `activation-plan` 并读取运行时能力。`dump-config` 是离线组合，不是当前 Loader 的验收证据。
3. 执行对应 playbook。server 的 `not-decided` 进入受控热替换；bundle 核对官方 manager outcome。
4. Host 与客户端分别验证。只看到安装、配置行、HTTP 200 或 boot manifest 都不足以证明功能。

预设内的进程级服务和 exact route 必须使用跨 generation lease。Managed upgrade 在 `agent.cordis.yml` 内容未变时应保留精确 stamp。Guardian 的恢复/隔离是故障路径，不能代替正常功能验收；见 [creator-guardian](creator-guardian.md)。

# 证据用语

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

`plugin add` 的 `PROFILE_INSTALLED` 和 `HOST_BUNDLE_ACTIVE` 证明公开 manager 已在相同 Host 上应用该 bundle；页面和行为仍需实际观察。`ARTIFACT_SYNCED; LIVE_ACTIVATION_UNPROVEN` 只报告同步事实。

# 分支 playbook

- [本地 bundle 安装](../playbooks/install-local-bundle.md)
- [热改 Host 配置行](../playbooks/hot-config-entry.md)
- [激活用户 preset](../playbooks/activate-user-preset.md)
- [更新已有 client bundle](../playbooks/update-existing-client-bundle.md)
- [新增 client 插件](../playbooks/add-new-client-plugin.md)
- [更新 server module](../playbooks/restart-server-plugin.md)
