---
type: Playbook
title: Add an official settings card
description: 按 rc.7 cookbook 给 scratch 插件加 Host namespace + settings.plugin.item 卡片。
tags: [settings, init, client]
aliases: ["adding a settings card", "settings card playbook", "init client"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-19T12:00:00Z }
stale_after: 2026-11-19
---

# 命令

```sh
pnpm dshx init my-feature --kind client
```

生成 Host named-export + `installSettingsSection`，以及 `src/client/index.tsx` 里对 `settings.plugin.item` 的注册。合同见 [settings-card](../contracts/settings-card.md)，原文 `docs/cookbook/adding-a-settings-card.md`。

# 核对

1. 两边 namespace / `key` 拼写一致。
2. `dsh.client.inject` 含 `@deepseek-ai/dsh-client-ui-settings-plugins`。
3. `exports["./client"]` 指向构建后的 `lib/client.js`，且产物包含 `window.__ModuleLoader__.load({ id, factory })`。scratch 的 `src/client/index.tsx` 只是源码，不能直接服务。
4. `dshx check` / `verify-boot`。需要 profile 产物时用 `sync-artifact`，再按 [live activation](../contracts/live-activation.md) 区分已有 client HMR 与新增 client 页面刷新。

不要为插件 Config 再注册一个顶层 `settings.section`，除非你真的要单独一页。
