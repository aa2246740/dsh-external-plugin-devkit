---
type: Runtime Contract
title: Creator Mode+ safe bridge
description: Creator Mode+ 是 user preset 加六个固定 dshx 工具；官方浏览器 WebUI 是兼容面，进程外 Guardian 负责失败恢复，DSH 会话不能控制自身进程。
tags: [creator-mode-plus, preset, webui, supervisor, safety]
aliases: [Creator Mode+, 创造模式+, dshx plugin, dshx preset, supervisor]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.8, sha: 141eb6fef83422698aef7a981029e843e8161534, date: 2026-08-20 }
sources:
  - id: preset-discovery
    resource: packages/preset/agent-presets/src/discovery.ts
    title: User preset discovery
  - id: preset-mount
    resource: packages/preset/agent-presets/src/mount.ts
    title: Bare packages resolve from the Harness profile
  - id: preset-session
    resource: packages/preset/agent-presets/src/session.ts
    title: Session preset generation
  - id: bridge-tools
    resource: tools/dshx/src/creator-plus/index.js
    title: Fixed Creator Mode+ tool surface and Host recovery route
  - id: bridge-client
    resource: tools/dshx/src/creator-plus/client.js
    title: Official Loader failure sentry
  - id: new-client-command
    resource: tools/dshx/src/internal/new-client.ts
    title: Ordered bounded new-client activation
---

# 与原版创造模式的关系

Creator Mode+ 不修改也不替换 shipped `cordis` preset。它是独立的用户 preset `creator-plus`，把文件化 dshx 工作流带进普通 DSH 会话。原版创造模式的内存包仍不能当作 profile 插件交付物。

# 责任边界

| 角色 | 可以做什么 | 不可以做什么 |
|---|---|---|
| Creator Mode+ 会话 | claim-plugin、scaffold、check、activation-plan、activate-new-client、status | 任意 shell/argv/path；start/stop/restart DSH |
| 外部 dshx + Guardian | 文件化构建、静态检查、事务日志、Host 恢复、官方 Loader 失败隔离 | 把 manifest/Loader 恢复冒充视觉或功能正确 |
| 用户 | 批准有影响的激活、重启和回滚 | 不承担插件内部运行时职责 |

这里的 supervisor 是 DSH 进程之外的 dshx/Guardian，不是模型会话，也不等于“用户本人一直手工盯着”。用户只负责授权正常流程中有影响的动作；已武装 Guardian 的故障恢复是固定、带 fuse 的既定协议。

# 兼容面

- 支持：官方 DSH 浏览器 WebUI、公开 Cordis 插件形式、公开 client runtime 与 UI slots。
- 可尝试但不验收：原样嵌入同一 WebUI 的第三方桌面壳。
- 不支持：App IPC、native menu、window chrome、桌面桥和壳专属刷新事件。
- 缺陷只有在官方浏览器 WebUI 可复现时，才进入 Creator Mode+ 的兼容性责任。

# 执行链

```text
official WebUI
  -> user preset roster
  -> new/blank Creator Mode+ session
  -> bridge v2 arms external Guardian with exact session identity
  -> claim one plugin for this session
  -> one of six fixed dshx tools
  -> child dshx CLI with bounded output
  -> file-backed plugin and layered evidence

external dshx / Guardian
  -> normal path follows only the planned lifecycle branch
  -> Host failure path quarantines the causal transaction and recovers once
  -> official client-Loader failure path quarantines one exact row before one reload
  -> incident is steered back to the exact persisted session
```

# 固定 argv 合同

六个模型可见工具分别只允许 `status`、`creator claim <id>`、
`creator scaffold <id> <kind>`、`check <id>`、
`activation-plan <id> --change <branch>` 和
`activate-new-client <id> --profile web --port <Host 派生端口>`。会话生命周期另有固定的
watch、release、recovery pull 和 recovery ack 形状。发布测试必须让每个形状真正穿过
bridge allowlist；只验证工具名称已经注册不算通过。

固定工具返回 `refusing an operation outside bridge v2` 说明 bridge 合同自身损坏。
会话必须原样报告工具名和错误，保留 claim 与源代码位置并停止；不得把它解释成
supervisor/权限拒绝，不得改走 raw shell、手工 profile 挂载或另一工作区，也不得声称
后续生命周期步骤成功。升级 bridge 且原固定工具成功后才能继续。

scaffold 的目标路径来自 `exec.agent.session.header.cwd` 这一不可变会话字段，不来自模型。
如果 Harness 的 `my-plugins/<id>` 不在该可写工作区内，DSHX 在会话工作区创建源码并
原子建立 Harness symlink；Agent 不再绕到另一目录建项目，也不让用户手工执行 `ln -s`。
新项目必须先 scaffold 才能 activation-plan，因为不存在的目标无法被 plan 检查。

# 激活合同

1. profile 只把 `dsh-external-plugin-devkit` 安装为普通依赖；Creator+ preset 从 package
   root 挂载固定 Host bridge，使同包的 browser sentry 能进入官方 client graph。
2. installer 从当前 shipped Standard 整体复制出用户 preset，精确注入 persona、skill 和固定工具行；拒绝覆盖已有用户 preset。
3. roster 发现 preset 不需要 Host restart；已开始会话不换 generation，必须用新会话或仍为空白的会话。RC8 可能让旧、新 generation 同时存活，因此 preset 中任何进程级 route/resource 必须由 Host-scoped 跨 generation lease 共享，或移到 Host composition。
4. 新 client 首次进入页面 graph 时刷新页面；已有 client bundle 后续更新走同页 HMR。
5. managed upgrade 如果没有改变 `agent.cordis.yml` 内容，必须保留它的精确 filesystem stamp，不能因为 skill/metadata 变化制造一个新 generation。
6. 只按 `SOURCE_BUILT`、`PRESET_ROSTER_VISIBLE`、`PRESET_SESSION_ACTIVE`、`CLIENT_LOADED`、`VISUAL_BEHAVIOR_VERIFIED` 等实际观察层报告。

Creator+ 0.6.1 的 fixed Loader-failure route 已实现上述 lease：每个 WebServer 只注册一次，最新仍存活的 generation 处理请求，最后一个 generation dispose 才注销。若 0.6.0 或更早版本在升级时已经 mount，它留下的是无法安全接管的旧式 unshared route；外部 supervisor 只需受控重启一次清掉该 scar，之后的升级不再需要这次兼容性重启。

多会话并发、同插件独占、精确事务快照、crash-loop fuse、正常退出与 recovery
steering 的唯一合同是 [Creator+ Guardian](creator-guardian.md)。这些恢复能力不改变
页面刷新和证据分层规则。

# 新 client 的唯一安全动作

Creator Mode+ 在 `dshx_check` 通过且用户已批准挂载后，只调用
`dshx_activate_new_client({ name })`。该固定工具不接受路径、profile、port、argv 或
shell 字符串；bridge 从当前 Web Host 进程读取端口，并按以下不可交换的顺序执行：

```text
SOURCE_BUILT check
  -> official dsh plugin link into profile
  -> prove package + lib/client.js resolve from profile
  -> insert or retrigger stable watched-patch row
  -> poll this Host boot manifest and served client.js
  -> return HOST_TREE_ACTIVE + CLIENT_MANIFEST_PRESENT
  -> browser reload remains separate
```

其中 `SOURCE_BUILT check` 包含 `client-cordis-inject`：client entry 每个直接
`ctx.<service>` 读取都必须由 entry-level `export const inject` 声明。
`package.json` 的 `dsh.client.inject` 是 package metadata，不满足 Cordis 服务依赖。

若 `exitCode != 0`，会话必须停止这条分支并报告 blocker，不得自己手改
`profile/package.json`、`cordis.patch.yml`，不得补跑 `pnpm install`，也不得重启宿主。
新插入的 patch 行在 Host manifest 无法证明时会回滚；已有同名同包行只会在 link
可解析之后做一次语义重触发。若旧 Agent 已让 Host 在安装前尝试解析同一 bare
package，Loader 可能保留负解析缓存；命令会明确命名这个 scar，由外部 supervisor
一次性重启并复验，Creator Mode+ 不得自行重启或无限重试。正常的新流程没有这次重启。

`CLIENT_MANIFEST_PRESENT` 只说明当前 Host 提供了 bundle。刷新后的页面没有实际加载
package id 和功能之前，Creator Mode+ 只能报告“已注册”，不能报告“可用”或“完成”。

# RC8 兼容结论

- Standard 与 Creator 的 preset/session discovery 合同未变，Creator Mode+ 仍然无需为 roster discovery 重启 Host。
- installer 复制 RC8 Standard，因此保留其 disabled Codex/Claude Code tool rows；Creator Mode+ 不自动安装或启用任何原生产品 provider。
- 用户选择某个 provider 时先走 `manifest` 分支安装对应 Profile Bundle 并重启，再走 `preset` 分支启用复制行并开新会话。两个动作不得合写成“热插拔完成”。
- RC8 外部 client package 使用 [external client build](client-build.md)，不修改 Harness workspace glob。
