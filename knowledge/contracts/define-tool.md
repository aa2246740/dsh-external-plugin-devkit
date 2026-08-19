---
type: Runtime Contract
title: defineTool
description: 模型面工具的最小形状、execute 合同、以及 UI 呈现是另一件事。
tags: [tools, defineTool]
aliases: ["defineTool", "tool", "工具"]
status: stable
resource: docs/cookbook/adding-a-tool.md
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: cookbook
    resource: docs/cookbook/adding-a-tool.md
    title: Tool authoring reference
  - id: tutorial
    resource: docs/user/develop/basic/tool.md
    title: Build a tool
  - id: tools-pkg
    resource: packages/core/tools
    title: Tool registry package
---

# 最小形状

```ts
export const name = 'my-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'read_file',
    description: 'Read a file from disk.',
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      return readFile(args.path, { encoding: 'utf8', signal: exec.signal })
    },
  }))
}
```

# execute 合同

- 参数已经按 schema 校验。
- 返回 **一个** canonical JSON value，不要从 body 返回 content blocks。
- throw 或非法返回值 ⇒ `isError`。
- 必须尊重 `exec.signal`。
- 注册是 effect：卸插件即卸工具。
- 不要在注册后改 schema / 换回调。热换 = dispose 再 register。

# 策略缝

- `tools/pre-execute`：allow / deny / ask（waterfall，必须 `next()` 除非否决）
- `ctx.tools.guard()`：单调最终拒绝
- `tools/execute`：包住 dispatch（超时 / 重试）
- `tools/post-execute`：改呈现或返回值
- `tools/result`：观察不可变结果

# UI 是另一件事

`output.render` 是模型面。卡片靠 `presentCall` / `presentResult` 的 `generic` / `terminal` / `diff`。没声明就走通用卡。

Code Mode 自动得到 `await tools.<name>(args)`，成功值是 canonical JSON，不是 Native 散文。

`dshx verify-boot` 只证明隔离进程里 `apply()` 跑过。活 tools 表不在 dump 里。静态看 `inject: ['tools']` + `defineTool`；目标 Host 的活证据是新会话里真的能调到这个 name。
