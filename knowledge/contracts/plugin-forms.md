---
type: Runtime Contract
title: Three plugin forms
description: Function / Object / Class 的官方运行时形状；namespace function 与 default object/class 的 Loader 选择边界。
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

# Function namespace（scratch 默认）

Harness 第一篇教程的 namespace 形态要求 named `apply`；`name` 和 `inject` 属于 `Plugin.Base`，均可选。这个 namespace 文件不要再放 default export：Loader 会优先取 default，兄弟 named metadata 不再组成同一个插件值。

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'
export function apply(_ctx: Context) {
  console.log('[my-plugins/hello] loaded')
}
```

没有依赖时可以省略 `inject`；dshx scaffold 保留空数组只是显式风格，不是运行时要求。namespace composition test 仍应保证没有 default，见 [testing](testing.md)。

# Object

default-export `{ apply(ctx, config), name?, inject?, … }`。在 `dshx.yml` 写 `kind: object`；此时 default 是官方形态，不应被 function-form 规则误报。

# Class / Constructor

default-export `new (ctx, config)`，通常 `extends Service`。在 `dshx.yml` 写 `kind: class`。`super(ctx, 'greeter')` 把实例登记到 `ctx.greeter`，登记是 effect，unload 即撤。`declare module` 只补类型。

# 注册皆为可逆 effect

`Fiber.effect()` 立刻跑 body、收集 disposer。unload 按注册反序 **开始** disposer；多个 async disposer 可能重叠。`ctx.on`、`ctx.plugin`、Service `provide`、`ctx.tools.register` 都挂在 fiber 上。

可选依赖不要写进 `inject`，在使用点 `ctx.get('name')`。
