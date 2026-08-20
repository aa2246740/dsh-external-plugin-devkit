---
type: Playbook
title: Why develop plugins outside Creator Mode
description: Creator Mode 能探针，但不能替代进程外的重启、验证和落盘。
tags: [creator, external, dshx]
aliases: ["why external", "out of process", "为什么出仓"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: tool-cordis
    resource: packages/extensions/tool-cordis/src/index.ts
    title: Seven defineTool names
  - id: host-runner
    resource: packages/extensions/cordis-host-runner/README.md
    title: Host-runner storage stance
  - id: disc-387
    resource: https://github.com/deepseek-ai/deepseek-harness/discussions/387
    title: Agent kills host, session stuck running
  - id: disc-1544
    resource: https://github.com/deepseek-ai/deepseek-harness/discussions/1544
    title: Orphan tool_call 400
---

# Creator Mode 实际交付什么

创造模式是 shipped preset 目录 id `cordis`，不是独立 bundle，也不是文档站专页。见 [creator-mode](contracts/creator-mode.md)。

它相对 Standard **只多**：`@deepseek-ai/dsh-tool-cordis` + 两份 preset skill。模型面七个工具是：

`cordis_inspect_list` / `query` / `self` / `cordis_define` / `run` / `stop` / `undefine`

没有 `cordis_mount`。旧文档和 skill 仍写 mount，那是过时表面。

# 它缺的三件关键能力

| 能力 | Creator 里 | 外部 `dshx` |
|---|---|---|
| 持久化 | `define`/`run` 只在进程内存，重启即无 | 写 `my-plugins/` + composition 文件 |
| 必要时重启宿主 | Agent 一 `kill` 就自杀，会话卡 running | 先 lifecycle 分类；正常变更只在 manifest/server 分支从进程外重启；Creator+ Guardian 可在真实故障后隔离并恢复一次 |
| 自主验证 | dump-config 不挂 Loader；inspect 只看当前 session | `verify-boot` 验隔离 cold boot；activation branch 验当前 Host/client |

# 正确分工

- **Creator / inspect**：看当前运行时挂了什么（当前 session）。
- **外部 Agent + dshx**：写文件、检查合同、生成绝对 `--patch`、启动、等 marker、失败读日志、从外面重启。
- **新 session / headless**：验证合成后的 agent，或逃离 pairing 伤疤。

Creator Mode+ 仍不把进程控制交给模型。它只把可信 session/plugin 归因写入外部事务，
由 [Creator+ Guardian](contracts/creator-guardian.md) 在 Host 已经失败之后执行固定隔离、
一次恢复与原 session steering。

详见 [creator-mode](contracts/creator-mode.md) 与 [external-loop](playbooks/external-loop.md)。

[^creator]: 创造模式合同
