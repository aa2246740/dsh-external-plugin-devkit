---
type: Playbook
title: Static-check a scratch plugin
description: 静态检查 scratch 插件的 named export、路径和 marker。通过不等于已 boot。
tags: [check, static, plugin]
aliases: [check, "static check", "dshx check", "check fail"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T15:00:00Z }
stale_after: 2026-11-17
---

# 命令

```sh
pnpm dshx check hello
pnpm dshx check              # 扫 my-plugins/ 下每一个目录（含别人留下的 scratch）
# 目录多于一个时请带名字，否则一次红会分不清是谁的
```

这是静态合同，见 [plugin-forms](../contracts/plugin-forms.md)。**通过 ≠ 已 boot。** 真启动走 [verify-boot](verify-boot.md)。

# 它看什么

| finding | 失败时 |
|---|---|
| `export-name` / `export-apply` | function/tool 没有 named-export `name` / `apply` |
| `default-export` | 出现 `export default`。Loader smoke 在 default 换掉 named export 时仍可能绿 |
| `export-inject` | 没有 `export const inject`（warn；空数组也要写） |
| `define-tool` | `kind=tool` 但源码没有 `defineTool` |
| `inject-tools` | 工具插件没 `inject: ['tools']` |
| `boot-marker` | `dshx.yml` 的 marker 字符串不在源码里 |
| `portable-path` | 已提交的 `cordis.yml` 写成了机器绝对路径 |
| `cordis-yml` | 已提交 overlay 不是顶层 YAML 数组 |
| `entry` | entry 文件不存在 |
| `client-entry` | `dsh.client` / `exports["./client"]` 指向的 `.js` 不存在（只有 `.mjs` 也会红） |

# 常见负例

```ts
export default function apply(_ctx: Context) {}   // check 红
```

```yaml
- insert:
    - id: hello
      name: '/workspace/my-plugins/hello/src/hello.ts'  # check 红；git 只留相对 name
```

覆盖已有脚手架：`dshx init <name> --force`，见 [init-plugin](init-plugin.md)。
