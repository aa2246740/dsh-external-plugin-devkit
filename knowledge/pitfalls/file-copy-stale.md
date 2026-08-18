---
type: Pitfall
title: "file: add does not recopy lib"
description: "dsh plugin add file: 报 Already up to date 时不会重拷 lib/，profile 里仍是旧包。"
tags: [plugin-add, file, ship]
aliases: ["Already up to date", "file:", "file: recopy", "stale file copy", "dshx ship", recopy, 不重拷]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-18T12:00:00Z }
stale_after: 2026-11-18
sources:
  - id: dsh-plugin
    resource: apps/cli/src/bin.ts
    title: dsh plugin forwards to pnpm in the profile
---

# 现象

改完社区插件源码并 `dsh plugin --profile web add file:/abs/pkg` 之后，Web 设置页 / 客户端 bundle 仍是旧文案。profile `package.json` 的 `file:` 行没变。pnpm 打印 **Already up to date**。

# 根因

`dsh plugin add` 把剩余参数交给 profile 目录里的 pnpm。源路径没变时 pnpm 不重拷 `node_modules/<name>/lib`。

# 修复

```sh
pnpm dshx ship /abs/path/to/pkg
# 或
pnpm dshx recopy /abs/path/to/pkg --restart
```

`ship` 先 `plugin remove` 再 `add file:<abs>`，然后核对应装副本的 version / `lib` 时间。`dshx doctor` 把落后的 file: 包装成 `stale-file-copy`。

不要只跑 `add`。不要手改 profile `node_modules` 里的文件当交付。
