---
type: Runtime Contract
title: tool-cordis seven names
description: 模型可见的七个工具名以 defineTool 为准，不是 README 或 skill 里的旧动词。
tags: [cordis, tools, creator]
aliases: ["cordis_inspect", "cordis_define", "cordis_run", "cordis_mount"]
status: stable
resource: packages/extensions/tool-cordis/src/index.ts
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: src
    resource: packages/extensions/tool-cordis/src/index.ts
    title: defineTool registrations
  - id: catalog
    resource: docs/tool-catalog.md
    title: Generated tool catalog
---

# 七个名字

| name | 做什么 |
|---|---|
| `cordis_inspect_list` | 列出当前 Host 已知 Inspect Provider |
| `cordis_inspect_query` | 对某一 Provider 的只读方法查询 |
| `cordis_inspect_self` | 查本 session 的动态 Plugin / Package |
| `cordis_define` | 记录不可变 Package（校验语法，不执行 apply） |
| `cordis_run` | 激活 Package（`mode: run \| update`） |
| `cordis_stop` | 停当前 Run，保留定义 |
| `cordis_undefine` | 永久删除该动态 Plugin 及其 Package |

`code.host` / `code.client` 是 **plain JavaScript function body**，必须 `return` 一个 Cordis Plugin。无 TypeScript / JSX / import 变换。

inspect 只报告 **当前 session**。包刻意 opt-in，按 bash 等价信任对待，`node:vm` **不是**安全沙箱。
