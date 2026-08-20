---
type: Playbook
title: Synchronize a local package artifact
description: "sync-artifact 处理官方 link: 本地开发和旧式 file: 重拷，只证明内容 hash；绝不隐式重启或宣称 live。"
tags: [ship, sync, file, link, artifact]
aliases: [dshx ship, dshx sync-artifact, ship, recopy, "file: ship", artifact sync]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.8, sha: 141eb6fef83422698aef7a981029e843e8161534 }
sources:
  - id: plugin-cli
    resource: apps/cli/src/plugin.ts
    title: Official local plugin installation
---

# 命令

~~~sh
dshx sync-artifact /absolute/path/to/package
dshx ship /absolute/path/to/package       # compatibility alias
~~~

# 行为

- 尚未安装的本地目录走官方 local-path add，预期 profile 记录 link: dependency。
- 已有 link: 指向同一源目录时不 remove/add；直接核对 package 和 lib/ 内容。
- 旧式 file: dependency 才 remove + add 强制重拷。失败会尝试恢复旧 dependency，并恢复原 dsh.profile.bundles 顺序。
- lib/ 用内容 hash 核验，不再用容易误判的 mtime。
- 成功固定结束为 ARTIFACT_SYNCED; LIVE_ACTIVATION_UNPROVEN。

ship --restart 已禁用。下一步必须单独运行 activation-plan --change patch|manifest|preset|client|new-client|server|artifact。

# 完成标准

profile package 内容与源产物一致，且没有改变既有 bundle precedence。当前 Host 和浏览器是否已生效仍是独立验收。

旧 pnpm file: 不重拷现象见 [file-copy-stale](../pitfalls/file-copy-stale.md)；安装不等于 live 见 [installed-is-not-live](../pitfalls/installed-is-not-live.md)。
