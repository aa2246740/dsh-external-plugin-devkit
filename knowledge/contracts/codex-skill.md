---
type: Runtime Contract
title: Codex-style $skill invocation
description: Codex 用 $name 调用 skill，用 / 调用内置命令；DSH 官方只有 /name。外部插件可以补上 $ 手势，但不能在不改核心的情况下让 $ 弹出菜单。
tags: [skill, dollar, codex, gesture, commands]
aliases: ["$skill", "dollar skill", "Codex skill", "$ 引用", "美元符号 skill", "slash skill"]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.8, sha: 141eb6fef83422698aef7a981029e843e8161534, date: 2026-08-20 }
sources:
  - id: tool-skill
    resource: packages/skill/tool-skill/src/index.ts
    title: Official /name pre-step gesture
  - id: ui-skill
    resource: packages/client/ui-skill/src/client/index.ts
    title: Official / skill menu
  - id: trigger-char
    resource: packages/client/ui-input-trigger/src/types.ts
    title: Frozen TriggerChar
  - id: detect
    resource: packages/client/ui-input-trigger/src/core/detect.ts
    title: Composer trigger scan
  - id: example
    resource: examples/codex-skill/src/codex-skill.ts
    title: External $name plugin
---

# Codex 真实语法（不要猜成「斜杠也能用」）

Codex 把 skill 和 slash command 分成两套前缀：

| 用户输入 | Codex |
|---|---|
| `$prd` / `please use $prd` | 调用 skill |
| `/model` `/status` `/skills` | 内置命令 |
| `/prd` | **不是** skill。CLI 报 Unrecognized command。OpenAI：*Skills should be invoked using `$`.* |
| `@` 统一 mention | 文件 / plugin / skill 一起搜；选 skill 时插入 `$name` |
| `$` 选择器 | 只列 skill 和 plugin，不列文件 |

「斜杠也能用 $ 也能用」是错的。要跟 Codex 一模一样，就是 **`$` = skill，`/` = 命令**。

# DSH 官方现状（rc.8）

- 人发命令：`ctx.commands.register`，composer 行首 `/`，**不进模型**。
- 用户 skill 手势：`dsh-tool-skill` 在 `agent/pre-step` 扫描空白包围的 `/name`，注入 `<skill_content>`。
- 模型 skill：`skill` 工具 + `<available_skills>` 目录。
- Composer trigger：`TriggerChar = '/' | '@'`。`$` 没有菜单、没有 chip。
- 未知 `/foo`：**会**变成普通 `session.prompt`（和 Codex 拒绝未知 `/` 不同）。若 `foo` 是 user-invocable skill，官方仍会注入。

# 外部插件能做什么

`examples/codex-skill` 在 `agent/pre-step` 再扫一遍 `$name`，查找 `ctx.skills.get`，对 `isUserInvocable` 的定义调用 `renderSkillContent`，source 仍是 `{ kind: 'skill-invocation', form: 'instructions' }`。所有入口（Web / TUI / ACP）共用这条宿主路径，不需要 skill RPC。名称必须字母开头（比官方 `/name` 略严），这样 `$1` / `$2` 不会被当成 skill。

激活分支是 **patch**。不要把它写成 slash command：`ctx.commands` 的成功文本默认不进模型。

官方 `/name` 手势插件**撤不掉**。要禁止 `/skill` 才算「和 Codex 一样拒绝斜杠 skill」，得换掉或补丁 `dsh-tool-skill`，那不是外部 function 插件的范围。

# Composer `$` 菜单

注册 `InputTriggerSource { trigger: '$' }` 在 rc.8 **不会**弹出菜单：`detectTrigger` 只向左找 `/`，`scanTextRefs` 只认 `/@`。

今天能做的 Codex 对齐：

1. 宿主 `$name` 注入（本插件）。
2. 可选 client：在 `@` 上挂 skill 源，`onPick` 插入 `$name `（统一 mention）。
3. 可选核心补丁：`examples/codex-skill/patches/dollar-trigger.md`，然后才能 `trigger: '$'`。

# 不要做的事

- 不要把 skill 注册成 `ctx.commands` 来「支持 $」。
- 不要在 Creator Mode 的 `cordis_define` 里交付这个插件；进程内存过不了重启。
- 不要改 `agent-loop`。
- 不要把 `/` skill 菜单改成插入 `$name` 去「骗」官方 source；`(trigger, name)` 已被 `skill` 占用，外部插件换不掉它。
