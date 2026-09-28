---
type: Contract
title: Harness update assistant
description: 只读盘点官方版本与插件兼容清单，禁止通过插件工具构建或切换官方源码。
tags: [dshx, update, harness, plugin, rollback, rc1]
aliases: [update assistant, Harness 更新, update plan, update prepare, update verify, update apply, update rollback, client graph]
status: stable
resource: tools/dshx/src/commands/update.ts
generated: { by: dshx/codex, at: 2026-09-04T03:20:00Z }
stale_after: 2026-11-24
---

# 插件开发不切换 Harness 源码

仅保留 `dshx update plan`，用于读取当前版本、官方目标版本和插件兼容清单。

`update prepare`、`verify`、`apply`、`rollback` 已由 CLI 无条件拒绝：`CORE_SOURCE_IMMUTABLE`。不会创建源码候选、重新构建官方包、切换 checkout 或执行源码回滚；`--force` 无例外。旧版的升级流水线文档不再构成执行授权。

如用户要升级官方应用，应作为独立的官方应用维护任务处理；插件开发继续使用当前公开接口。不要以插件接口不足为理由自动升级或给 Host 打补丁。详见 [plugin-only](plugin-only.md)。
