---
type: Runtime Contract
title: --patch overlay and plugin name resolution
description: overlay 不改 profile 解析目录；相对 name 相对 profile 目录，不相对 overlay 文件。
tags: [patch, overlay, paths]
aliases: ["--patch", "overlay", "绝对路径", "portable", "portable-path"]
status: stable
resource: docs/user/develop/basic/index.md
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: first-plugin
    resource: docs/user/develop/basic/index.md
    title: Register it in cordis.yml
  - id: cli-ref
    resource: apps/cli/reference/README.md
    title: --patch overlay contract
---

# 官方要求

第一篇教程把插件 `name` 写成 **绝对路径**。原因：`--patch` 只贡献配置，不改 Loader `baseUrl`。相对路径按 **profile 目录**（`$DSH_HOME/profiles/<name>/`）解析，不是 overlay 文件，也不是仓库根。

`!!js` 表达式 **不能** 用在 `name` 上当路径（会变成非 string，`name.startsWith` 炸掉）。

# dshx 怎么处理

1. git 里的 `my-plugins/<id>/cordis.yml` 只写便携相对名：`name: './src/<id>.ts'`
2. `dshx overlay` / `start` / `verify` 在 `.dshx/overlays/<id>.yml` 生成带绝对 `name` 的机器本地文件
3. 那个生成文件 **不要提交**

不要再手写 `/workspace/...` 进 git。

# 合法 overlay 形状

顶层 YAML 数组，`insert` 或按 id 整行替换：

```yaml
- insert:
    - id: hello
      name: '/absolute/path/to/src/hello.ts'
```
