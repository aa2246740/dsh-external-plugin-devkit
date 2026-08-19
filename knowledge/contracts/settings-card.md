---
type: Runtime Contract
title: Plugin-owned settings cards
description: rc.7 起插件在「插件」分区注册自己的设置卡片。Host 用 installSettingsSection，浏览器注册 settings.plugin.item，键是 settings 命名空间。
tags: [settings, slots, client]
aliases: ["settings card", "settings.plugin.item", "installSettingsSection", "设置卡片", "plugin settings"]
status: stable
resource: docs/cookbook/adding-a-settings-card.md
generated: { by: dshx/grok-4.6, at: 2026-08-19T12:00:00Z }
stale_after: 2026-11-19
sources:
  - id: cookbook
    resource: docs/cookbook/adding-a-settings-card.md
    title: Adding a settings card
  - id: settings-sub
    resource: docs/subsystems/settings.md
    title: User settings
  - id: install
    resource: packages/settings/settings/src/index.ts
    title: installSettingsSection
  - id: slot
    resource: packages/client/ui-settings-plugins/src/client/slot-contract.ts
    title: settings.plugin.item is keyed
---

# 官方路径（0.1.0-rc.7）

两半必须同一命名空间。Host 提供 namespace，浏览器用**同一个** kebab-case 当 slot `key`。Plugins 分区的「插件配置」页按 Host 已服务的 namespace 配对卡片：没 Host 半边就不渲染；没卡片的 namespace 也不占位。

## Host

`installSettingsSection(ctx, settingsNamespace('my-plugin'), Config, config, hooks)`（`@deepseek-ai/dsh-settings`）。

- `Config` 是 schemastery schema，只放用户可改的子集；组装默认值走 composition `base`。
- `hooks.setSource` / `onChange`：有 settings 服务时读 resolved scope，服务卸掉回退 composition entry。
- `validate`：schema 表达不了的约束，拒的是**那次写**，不是下一次使用。
- `applies: 'restart'` 只是 UI 提示；owner 不 watch。
- `role('secret')` 的字段不会出现在读回里。

没有 settings provider 时这段 wiring 不跑，插件仍按 `cordis.yml` entry 工作。

## Client

注册 **`settings.plugin.item`**（`kind: 'keyed'`，不是 list）。声明 `key`（namespace），**不要** `id` / `order`。卡片自己画 chrome、控件、文案。

```ts
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'

ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
  name: 'settings.plugin.item',
  key: 'my-plugin',
  locale: 'settings.myPlugin',
  inject: () => card.inject(),
}, MyPluginCard))
```

`inject` 至少含 `slots`、`settingsScope`。读写走 `ctx.settingsScope.bind({ namespace })`：看 `value` / `base` / `user`；覆盖看 **user 键是否存在**，不是值；`set` / `unset` 只动 user 层。

`package.json`：

```json
{
  "exports": { "./client": "./lib/client.js" },
  "dsh": {
    "client": {
      "platform": "web",
      "inject": ["@deepseek-ai/dsh-client-ui-settings-plugins"]
    }
  }
}
```

类型用 `import type`，禁止跨插件 value import（client bundle-purity）。宿主加载的是 `.js` 的 lazy-CJS，见 [file-copy-stale](/pitfalls/file-copy-stale.md)。

# 不要和整页搞混

| 要做什么 | slot |
|---|---|
| 插件自己的配置卡（官方「设置卡片」） | `settings.plugin.item`，key = namespace |
| 设置里单独一页（登录、向导） | `settings.section`，有 `id` / `order` / `label` |
| 通用设置里一行 | `settings.general.item` |
| 插件分区里再加一个 tab | `settings.plugins.tab` |

社区 OAuth 登录页用 `settings.section` 是整页，不是配置卡。不要为普通 Config 再占一行导航。

类型声明：`settings.section` 在 `ui-settings`；`settings.plugin.item` 在 **`ui-settings-plugins`** 的 slot-contract。
