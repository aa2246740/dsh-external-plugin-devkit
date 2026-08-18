---
type: Playbook
title: "Ship a file: plugin into the profile"
description: "用 dshx ship 强制重拷 file: 包。add 显示 Already up to date 不等于 lib 已更新。"
tags: [ship, file, deliver]
aliases: ["dshx ship", "ship", recopy, "file: ship"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-18T12:00:00Z }
stale_after: 2026-11-18
---

# 命令

```sh
pnpm dshx ship /abs/path/to/pkg
pnpm dshx ship dsh-oauth-login          # profile 里已有的 file: 名
pnpm dshx recopy ./dsh-files-panel --restart
```

# 它做什么

1. `dsh plugin --profile <p> remove <name>`
2. `dsh plugin --profile <p> add file:<abs>`
3. 核对 `$DSH_HOME/profiles/<p>/node_modules/<name>` 的 version / `lib` 是否新于源

`--restart` 只在核验通过后从外面重启。不要在 Creator 会话里 kill。

细节见 [file-copy-stale](../pitfalls/file-copy-stale.md)。
