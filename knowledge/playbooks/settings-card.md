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
3. `exports["./client"]` 指向真实存在的 `.js`（或 scratch 的 `src/client/index.tsx`）。
4. `dshx check` / `verify`。改完 `file:` 包装进 profile 用 `dshx ship`。

不要为插件 Config 再注册一个顶层 `settings.section`，除非你真的要单独一页。
