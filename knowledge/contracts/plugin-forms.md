---
type: Runtime Contract
title: Three plugin forms
description: Function / Object / Class 插件的运行时形状。Function 用 named export，不要 default export。
tags: [plugin, cordis, apply, inject]
aliases: ["plugin", "plugin forms", "named export", "function plugin", "apply", "inject", "default export", "export default", "no default export"]
status: stable
resource: vendor/cordis/src/registry.ts
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: registry
    resource: vendor/cordis/src/registry.ts
    title: Plugin type contract
  - id: first-plugin
    resource: docs/user/develop/basic/index.md
    title: Your first plugin
  - id: tutorial-01
    resource: docs/cordis-tutorial/01-first-plugin.md
    title: First plugin tutorial
---

# 共享基座

三种形态共享 `Plugin.Base`：`name?`、`Config?`（Standard Schema，启动前校验）、`inject?`、`provide?`、`intercept?`。

`inject` 不是一次性启动检查：所需服务在运行中消失时依赖方会被卸掉，服务回来再装。

# Function（scratch 默认）

Harness 文档惯用 **named export** `name` / `inject` / `apply`，不要 default export。

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'
export const inject = []

export function apply(_ctx: Context) {
  console.log('[my-plugins/hello] loaded')
}
```

无 `inject` 的 composition 插件还要保证 `expect('default' in mod).toBe(false)`，否则 default 换掉 named export 时 Loader smoke 仍绿。见 [testing](testing.md)。

# Object

`{ apply(ctx, config), name?, inject?, … }`。`ctx.plugin({ inject, apply })` 与 `ctx.inject(deps, callback)` 等价。

# Class / Constructor

`new (ctx, config)`，通常 `extends Service`。`super(ctx, 'greeter')` 把实例登记到 `ctx.greeter`，登记是 effect，unload 即撤。`declare module` 只补类型。

# 注册皆为可逆 effect

`Fiber.effect()` 立刻跑 body、收集 disposer。unload 按注册反序 **开始** disposer；多个 async disposer 可能重叠。`ctx.on`、`ctx.plugin`、Service `provide`、`ctx.tools.register` 都挂在 fiber 上。

可选依赖不要写进 `inject`，在使用点 `ctx.get('name')`。
