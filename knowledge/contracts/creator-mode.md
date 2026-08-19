---
type: Runtime Contract
title: Creator Mode (preset cordis)
description: 创造模式是 shipped agent-preset id cordis，不是独立 bundle，也没有规格对象。
tags: [creator, cordis, preset]
aliases: ["Creator Mode", "创造模式", "preset cordis", "PTC mode", "Code mode", "PTC 模式"]
status: stable
resource: apps/cli/config/agent-presets/cordis/preset.yml
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: preset
    resource: apps/cli/config/agent-presets/cordis/preset.yml
    title: 创造模式 preset.yml
  - id: agent-yml
    resource: apps/cli/config/agent-presets/cordis/agent.cordis.yml
    title: Creator composition
  - id: tool-src
    resource: packages/extensions/tool-cordis/src/index.ts
    title: Seven tools
---

# 它是什么

磁盘：`apps/cli/config/agent-presets/cordis/`
UI：`name: 创造模式`，`order: 4`
并列：`standard` / `code` / `minimal` / `cordis`。磁盘 id 仍是 `code`；**0.1.0-rc.7** 起英文 UI 把 `Code mode` 改成 **`PTC mode`**（中文「PTC 模式」）。搜 Code mode 先对这个 rename，不要当新 preset。

产品页三句话：inspect 当前运行时、在内存里试 Cordis 插件、把它们组合成新 mode。**没有** Creator 规格对象能绑住后续步骤。

# 四模式差在 agent-plane

Sandbox / approval / permission **始终在** `dsh-base`。四个 preset 都不重挂这组边界，也不得放松。

创造模式相对 Standard 的增量：`dsh-tool-cordis` + 本 preset `skills/`。不要从「goal 子系统存在」推出 Creator 多挂了 goal driver。

# 内存 vs 落盘

`cordis_define` 校验语法，**不**执行 `apply`。`cordis_run` 才激活。host-runner **不写盘**；session 日志只存 define 元数据、从不存代码。进程重启不会自动恢复。

`cordis_run` 对未授权 Client Package **立刻**返回 `awaiting-approval`，工具本身不等页面批准。

写入用户根 preset 后，**已开 session 仍用启动时的 generation**。要看新合成必须新开 session。`standingKeyFor` 只做成品后的最后一次 mount 校验，不要每改一行就 validate。

# 何时用

用：隔离进程里探针，把结果抄进用户根 preset 或 `my-plugins/`。
不要用：改 shipped preset、放宽权限、把 `cordis_define` 当交付物。
