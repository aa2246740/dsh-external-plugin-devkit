---
type: Runtime Contract
title: Plugin-only source boundary
description: 官方 DSH 源码只读，插件开发不得依赖 Host 补丁。
tags: [creator-mode-plus, source, boundary, safety]
aliases: [CORE_SOURCE_IMMUTABLE, no core patches, 不改源码, 插件边界]
status: stable
resource: tools/dshx/src/core-boundary.js
---

## 不可跨越：只开发插件，不改 DSH 源码

DSHX 与 Creator Mode+ 只用于独立外部插件。官方 Harness 源码、内置插件、内置预设、官方包及其构建产物均为只读；本机工作树、临时副本、Git worktree、node_modules 链接和安装目录遵守同一规则。

禁止为插件补 Host 接口、改核心实现、替换官方文件、应用 Host 源码补丁，或让插件构建重新编译官方子项目。需要“先改 Host 才能完成”的方案不成立：先找公开扩展点，在插件内实现；接口确实缺失时报告具体能力缺口，并完成其余插件工作。不要把核心修改包装成兼容修复、临时验收或交付前提。

插件开发授权、用户确认接管、自动审批、交接包中的“必要时补 Host”、`--force` 都不能解除此规则。外部监督者同样受约束。不要为此请求一次性豁免。用户自己的 profile 的 watched `cordis.patch.yml` 是配置扩展，与修改官方源码的 `.patch` 完全不同；插件包、插件自己的构建目录、用户预设和正式插件安装配置仍可按已授权流程操作。

看到 `CORE_SOURCE_IMMUTABLE` 就调整插件方案；不得换 shell、脚本、路径、复制目录或其他 Agent 绕过。只能读取官方实现和公开 API，所有插件构建输出都留在插件目录。

## 执行边界

- DSHX 的 target loader、scaffold、client bundle 与 artifact sync 在执行前校验真实路径。官方包、官方树目录、越界 entry 和软链接指向的官方源码会被拒绝；`--force` 不绕过校验。
- `check` 检查指向 `packages/`、`apps/`、`vendor/` 等官方目录的 source diff，以及会重建官方子项目或把输出写出插件目录的 TypeScript 配置。激活仍需经过 check。
- Creator+ 使用公开 `tools.guard`，在允许/自动审批之后仍可拒绝 write、edit、apply_patch、直接 shell/terminal 写入。规则通过公开 systemPrompt section 加入当前运行时，缺少 guard 的 Host 拒绝加载 bridge。
- 源码可读。插件目录内正常写入与构建保留。Shell 必须由 Host 的 workspace-write 沙箱约束；不要给构建脚本 danger-full-access，也不要把包含整份 Harness 的目录作为可写工作区。
- 这些路径检查和静态检查不是通用代码证明或机器级文件锁。外部 Codex/Claude/人类终端拥有的操作系统写权限不受 DSHX CLI 控制；其沙箱必须把官方 checkout 保持只读。不可宣称只靠关键词就能阻止任意代码动态拼接路径。

## 能力不足的正确交付

记录所需能力、已检查的公开服务/slot/API、可行的插件内替代和剩余限制。不要生成 Host patch、偷偷安装 patched build，或把“临时”改动留作下一次启动依赖。验收还需确认卸载插件后无需恢复官方文件。
