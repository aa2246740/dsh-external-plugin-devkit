---
type: Runtime Contract
title: Creator Mode+ safe bridge
description: Creator Mode+ 是 user preset 加 dshx 固定工具桥；官方浏览器 WebUI 是兼容面，外部 CLI 才是 supervisor，DSH 会话不能控制自身进程。
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
    title: Fixed Creator Mode+ tool surface
  - id: new-client-command
    resource: tools/dshx/src/internal/new-client.ts
    title: Ordered bounded new-client activation
---

# 与原版创造模式的关系

Creator Mode+ 不修改也不替换 shipped `cordis` preset。它是独立的用户 preset `creator-plus`，把文件化 dshx 工作流带进普通 DSH 会话。原版创造模式的内存包仍不能当作 profile 插件交付物。

# 责任边界

| 角色 | 可以做什么 | 不可以做什么 |
|---|---|---|
| Creator Mode+ 会话 | scaffold、check、activation-plan、activate-new-client、status | 任意 shell/argv/path；start/stop/restart DSH |
| 外部 dshx CLI | 文件化构建、静态检查、隔离验证、受控 supervisor 操作 | 把离线结果冒充当前 Host/UI 证据 |
| 用户 | 批准有影响的激活、重启和回滚 | 不承担插件内部运行时职责 |

这里的 supervisor 是 DSH 进程之外的 dshx/宿主操作者，不是模型会话，也不等于“用户本人一直手工盯着”。用户只负责授权有影响的动作。

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
  -> one of five fixed dshx tools
  -> child dshx CLI with bounded output
  -> file-backed plugin and layered evidence

external supervisor
  -> only the lifecycle branch that was planned
  -> optional browser reload / Host restart / rollback
```

# 激活合同

1. profile 只把 `dsh-external-plugin-devkit` 安装为普通依赖；它不是 root bundle。
2. installer 从当前 shipped Standard 整体复制出用户 preset，精确注入 persona、skill 和固定工具行；拒绝覆盖已有用户 preset。
3. roster 发现 preset 不需要 Host restart；已开始会话不换 generation，必须用新会话或仍为空白的会话。
4. 新 client 首次进入页面 graph 时刷新页面；已有 client bundle 后续更新走同页 HMR。
5. 只按 `SOURCE_BUILT`、`PRESET_ROSTER_VISIBLE`、`PRESET_SESSION_ACTIVE`、`CLIENT_LOADED`、`VISUAL_BEHAVIOR_VERIFIED` 等实际观察层报告。

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

若 `exitCode != 0`，会话必须停止这条分支并报告 blocker，不得自己手改
`profile/package.json`、`cordis.patch.yml`，不得补跑 `pnpm install`，也不得重启宿主。
新插入的 patch 行在 Host manifest 无法证明时会回滚；已有同名同包行只会在 link
可解析之后做一次语义重触发。若旧 Agent 已让 Host 在安装前尝试解析同一 bare
package，Loader 可能保留负解析缓存；命令会明确命名这个 scar，由外部 supervisor
一次性重启并复验，Creator Mode+ 不得自行重启或无限重试。正常的新流程没有这次重启。

# RC8 兼容结论

- Standard 与 Creator 的 preset/session discovery 合同未变，Creator Mode+ 仍然无需为 roster discovery 重启 Host。
- installer 复制 RC8 Standard，因此保留其 disabled Codex/Claude Code tool rows；Creator Mode+ 不自动安装或启用任何原生产品 provider。
- 用户选择某个 provider 时先走 `manifest` 分支安装对应 Profile Bundle 并重启，再走 `preset` 分支启用复制行并开新会话。两个动作不得合写成“热插拔完成”。
- RC8 外部 client package 使用 [external client build](client-build.md)，不修改 Harness workspace glob。
