---
type: Playbook
title: Static-check a scratch plugin
description: 静态检查官方三种插件形态、路径、marker 和 client lazy-CJS 产物。通过不等于 cold boot 或 live activation。
tags: [check, static, plugin]
aliases: [check, "static check", "dshx check", "check fail"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T15:00:00Z }
stale_after: 2026-11-17
---

# 命令

```sh
dshx check hello
dshx check              # 扫 my-plugins/ 下每一个目录（含别人留下的 scratch）
# 目录多于一个时请带名字，否则一次红会分不清是谁的
```

这是静态合同，见 [plugin-forms](../contracts/plugin-forms.md)。**通过 ≠ cold boot ≠ live activation。** 隔离启动走 [verify-boot](verify-boot.md)，现有 Host 生命周期走 [live activation](../contracts/live-activation.md)。

# 它看什么

| finding | 失败时 |
|---|---|
| `export-apply` | function/tool/client namespace 没有 named `apply` |
| `export-name` / `export-inject` | 可选 metadata；缺少是 info，不是错误 |
| `default-export` | namespace function 出现 default；Loader 会优先 default 而丢掉兄弟 named metadata |
| `object-form` / `class-form` | kind 与官方 default object/class 形状不匹配 |
| `define-tool` | `kind=tool` 但源码没有 `defineTool` |
| `inject-tools` | 工具插件没 `inject: ['tools']` |
| `boot-marker` | `dshx.yml` 的 marker 字符串不在源码里 |
| `portable-path` | 已提交的 `cordis.yml` 写成了机器绝对路径 |
| `cordis-yml` | 已提交 overlay 不是顶层 YAML 数组 |
| `entry` | entry 文件不存在 |
| `client-entry` / `client-entry-format` | built `.js` 不存在，或没有 `window.__ModuleLoader__.load({ id, factory })` handoff；source TSX 会红 |

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
