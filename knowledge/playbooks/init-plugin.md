---
type: Playbook
title: Scaffold a scratch plugin
description: 用 dshx init 建 function、tool、client、object 或 class scratch 插件；client 明确要求后续构建 lazy-CJS lib/client.js。
tags: [init, scaffold]
aliases: ["init", "scaffold", "脚手架", "overwrite", "already exists", "init --force"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
---

# 命令

```sh
dshx init my-feature
dshx init my-tool --kind tool
dshx init my-panel --kind client
dshx init my-object --kind object
dshx init my-service --kind class
dshx init my-feature --force    # 覆盖已有脚手架文件
```

目录已存在且没有 `--force` 时，`init` 报 `already exists`，不会改文件。

这里的 `--force` **只覆盖脚手架文件**。`start` / `verify` 的 `--force` 是另一回事（不要抢别人的端口），见 [dshx-cli](../references/dshx-cli.md)。搜旗标 `--force` 会先落到那篇，搜 `overwrite` / `already exists` 才是这篇。

生成：

```
my-plugins/<name>/
  dshx.yml          # id / entry / marker / kind
  cordis.yml        # 便携相对 name，不要改成机器绝对路径
  src/<name>.ts
  README.md
```

# 写的时候

- function namespace：named `apply`；`name` / `inject` 可选；无 default
- tool：`inject: ['tools']` + `defineTool`
- object：default `{ apply, name?, inject? }` + `kind: object`
- class/service：default constructor + `kind: class`
- client：Host `installSettingsSection` + 浏览器 `settings.plugin.item`；package export 预设为 `lib/client.js`。源码 TSX **不能**直接作为 browser entry。RC8 脚手架使用 dshx `externalClientBundle` 构建 `window.__ModuleLoader__.load({ id, factory })` lazy-CJS 产物；不要导入只发现 `packages/*/*` 的官方 workspace helper。见 [client-build](../contracts/client-build.md) 与 [settings-card](settings-card.md)
- 保留 `console.log('[my-plugins/<name>] loaded')`，与 `dshx.yml` 的 `marker` 一致
- 可调参数用 `Config` schema，不要写死
- 注册走 `ctx.effect` / `ctx.on` / `ctx.tools.register`

不要把 scratch 插件加进 pnpm workspace，除非它要成为正式包。正式包走 `docs/cookbook/adding-a-package.md`。
