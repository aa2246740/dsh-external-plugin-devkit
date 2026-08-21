---
type: Playbook
title: Activate a user-authored preset
description: 用户 preset 每次 roster 调用重新发现，不重启 Host；它的工具与提示词只在新会话或仍为空白的会话 generation 中生效。
tags: [preset, creator-mode, session, activation]
aliases: [user preset, Creator Mode, Creator Mode+, new session, 用户模式, 创造模式]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.8, sha: 141eb6fef83422698aef7a981029e843e8161534, date: 2026-08-20 }
sources:
  - id: preset-discovery
    resource: packages/preset/agent-presets/src/discovery.ts
    title: Discovery re-reads roots on every call
  - id: preset-session
    resource: packages/preset/agent-presets/src/session.ts
    title: Preset selection is recorded per session
  - id: preset-seat
    resource: packages/client/ui-agent-preset/src/client/seat-store.ts
    title: WebUI selection applies only to a blank or next session
---

# 步骤

1. 从 shipped preset 复制到用户 root；写入新的 preset id、`preset.yml` 和需要的 skill。完成条件：shipped 目录与 Harness core 都未改变；preset 内的 exact route/singleton 等进程级资源已使用 Host-scoped 跨 generation lease，或已移到 Host composition。
2. 将 preset 命名的外部包安装为 profile 的普通依赖，不把 agent-plane 工具同时插入 root patch 或 bundle。完成条件：包从 active profile 可解析且没有重复 loader id。
3. 运行 `dshx activation-plan <package> --change preset`。完成条件：结论为 Host 不重启、使用新会话、browser reload 仅在当前页面名单未刷新时需要。
4. 打开官方 WebUI preset picker；名单已缓存时刷新/重开页面。完成条件：用户 preset 的 name 与 description 可见。
5. 新建会话，或在第一轮开始前切换仍为空白的会话。完成条件：session header 记录目标 preset；已有非空会话不被改写。
6. 调用一个 preset 独有工具，或观察一个 preset 独有 prompt/skill 行为。完成条件：`PRESET_ROSTER_VISIBLE` 与 `PRESET_SESSION_ACTIVE` 都有直接证据。

# 边界

- preset discovery 和 session composition 属于官方 WebUI/Host；App 壳不是依赖。
- profile bundle 清单仍是 `manifest` 分支；只有“普通依赖供新 preset 动态解析”走本分支。
- 新 preset 不让已经开始的会话换 generation。需要新会话，不需要为了它重启 Host。
- managed upgrade 若未改变 `agent.cordis.yml` 内容，必须保留该文件的精确 filesystem stamp。不要为 skill/metadata-only 更新制造新 generation。
- 若一个旧版、未租赁的进程级资源已在当前 Host 注册并与新 generation 冲突，这是既有 server scar：从 DSH 外部受控重启一次。generation-safe 的正常 preset 更新仍不重启。
