---
type: Playbook
title: Restart after a server module change
description: Web 默认只保证配置 patch 热重组；server module 更新除非有该面的明确 HMR 测试，否则受控重启当前 dshx-owned Host。
tags: [server, module, restart, hmr]
aliases: [server plugin, server module, restart host, 服务端插件, module HMR]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.8, sha: 141eb6fef83422698aef7a981029e843e8161534 }
sources:
  - id: web-bundle
    resource: packages/bundle/web-app/cordis.patch.yml
    title: Shared module HMR disabled in Web
  - id: cordis-hmr
    resource: vendor/hmr/src/index.ts
    title: Conditional module HMR implementation
---

# 步骤

1. 构建 server 产物；需要 profile copy 时运行 `dshx sync-artifact <dir>`，确认它只报告 artifact。
2. `dshx activation-plan <plugin> --change server`。
3. `dshx status` 确认要重启的是当前由 dshx 监督的 PID、profile、port。没有 live owned PID 时，`restart-supervised` 必须拒绝，不得复活 stale last-host。
4. `dshx restart-supervised`。它只重启这个当前 owned Web Host；更换目标必须显式 `stop` 后 `start`。
5. 记录旧/新 PID，验证 post-boot marker、Host 行和真实行为。client 半如有变化，另按 client 分支验证。

# 何时可以不重启

只有该 server module 所在配置明确设置了 module-HMR root，并且专项测试证明它在当前 Web 组合中 reload/dispose 正确。不能拿 `cordis.patch.yml` 热更新成功来外推 server module 也能热换。
