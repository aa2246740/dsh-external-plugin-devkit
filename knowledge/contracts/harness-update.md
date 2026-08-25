---
type: Contract
title: Harness update assistant
description: 官方 Harness release、全部本地插件、事务 apply 与精确 rollback 的分层门禁。
tags: [dshx, update, harness, plugin, rollback, rc2]
aliases: [update assistant, Harness 更新, update plan, update prepare, update verify, update apply, update rollback, client graph]
status: stable
resource: tools/dshx/src/commands/update.ts
generated: { by: dshx/codex, at: 2026-08-24T12:50:00Z }
stale_after: 2026-11-24
---

# 状态机

`plan → prepare → verify → apply` 是单向门禁；`rollback` 只处理已经建立的 apply 事务。任何一步失败都不能把后续状态说成成功。

| 阶段 | 可见结果 | 明确不证明 |
|---|---|---|
| plan | 官方目标 tag/SHA、当前 branch/SHA、tracked dirty、全部目录与 symlink 插件 | 目标可构建 |
| prepare | 隔离 worktree 的 frozen install、Harness full build、全部插件 build | 当前 Harness 已更新 |
| verify | 每个插件静态检查和隔离 cold boot；Web client 还要 graph row + bundle 200 | 组合 UI 或正式 Host 已激活 |
| apply | 当前 checkout 切到 `dshx/<tag>`，实际依赖/Harness/插件全构建，回滚状态落盘 | 正式 Host 已重启或用户行为已验收 |
| rollback | 原 branch/SHA、根依赖、插件依赖和 `lib/` 恢复 | 升级后的数据迁移可逆（本合同不执行产品数据迁移） |

# 不变量

- 只接受官方 `deepseek-ai/deepseek-harness` origin 和 `dsh-v*` release tag。
- tracked Harness dirty、会被目标覆盖的 untracked 路径、无效插件清单都阻断 apply。
- `my-plugins` 的真实目录和 symlink 都进入矩阵；候选验证不改插件源字节。
- Web client 必须通过 RC2 原生 profile package resolution：本地包链接、package-name Loader row、`window.__DSH_BOOT__` 条目和可读取的 `client.js`。
- apply 前重新核对候选 SHA 与插件 source hash；任何漂移都要求重新 prepare/verify。
- apply 时若安装、完整构建、任一插件构建或检查失败，自动恢复备份并把状态记为 `auto-rolled-back`。
- live dshx-supervised Host 存在时 apply/rollback 都拒绝；更新助手不暗中 stop/restart 正式进程。

# 命令

```sh
dshx update plan [--target dsh-vX.Y.Z-rc.N]
dshx update prepare [--target ...] [--candidate /isolated/worktree]
dshx update verify [--target ...] [--candidate /same/worktree]
dshx update apply [--target ...]
dshx update rollback --target ...
```

事务状态位于 `.dshx/update-assistant/<tag>/`。它是机器本地证据，不提交 Git。最终报告必须分别写：已实现、已通过本地检查、已通过真实运行时、尚未验证或需要人工操作。
