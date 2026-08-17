---
type: Runtime Contract
title: Plugin Config schema
description: 导出与类型同名的 Schemastery Config；不要导出普通对象。校验在 apply 之前。
tags: [plugin, config, schema]
aliases: [Config, schema, schemastery, plugin-config, 配置]
status: stable
resource: docs/user/develop/basic/config.md
generated: { by: dshx/grok-4.6, at: 2026-08-17T14:00:00Z }
stale_after: 2026-11-17
sources:
  - id: config-doc
    resource: docs/user/develop/basic/config.md
    title: Plugin configuration
  - id: first-plugin
    resource: docs/user/develop/basic/index.md
    title: Your first plugin
---

# 合同

```ts
export interface Config {
  greeting: string
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
})

export function apply(ctx: Context, config: Config) {
  console.log(config.greeting)
}
```

Cordis 在 `apply` 前用导出的 schema 校验并填默认值。`Config` 必须实现 Standard Schema。**不要** `export const Config = { greeting: 'Hello' }`。[^config-doc]

写在 composition 行上：

```yaml
- id: hello
  name: './src/hello.ts'
  config:
    greeting: Hi
```

# 和本工作台

`dshx init` 的 function 插件可以先不带 `Config`。一旦用户要调 `retryPolicy` / timeout / API key，按这篇加 schema，不要在 `apply` 里手写默认值却不导出 `Config`。

形态合同见 [plugin-forms](plugin-forms.md)。

[^config-doc]: Plugin configuration
