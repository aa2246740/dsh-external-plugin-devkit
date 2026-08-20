---
type: Playbook
title: Start here
description: "外部 Agent 进入本仓库后应先读的入口：知识库怎么用、工具在哪、什么是交付物。"
tags: [entry, agent, okf, dshx]
aliases: [entry, onboarding, first read, 入口, start]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: okf-spec
    resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
    title: Open Knowledge Format v0.2
    author: team:google-cloud
  - id: arch
    resource: docs/architecture.md
    title: DeepSeek Harness Architecture
  - id: agents
    resource: AGENTS.md
    title: Repository agent standing orders
---

# 你有一份知识库

仓库里已经放好一份 **OKF v0.2 bundle**：

- 目录：`tools/dshx/knowledge/`
- 浏览：`dshx kb`
- 列目录：`dshx kb ls`
- 目录卡片（只有 frontmatter）：`dshx kb catalog`
- 读一篇：`dshx kb cat start-here`
- 对现象：`dshx kb cat maps/symptoms`
- 搜索：`dshx kb search retry` → **立刻** `dshx kb cat contracts/llm-retry`
- 校验：`dshx kb lint`

按 Google OKF 的约定：先读 `index.md`，再顺着 markdown 链接走。`kb search` 只返回 id 和一句 description。**snippet 不是合同，命中后必须 `kb cat`。** 不要对整仓官方长文做无目的全文搜索来「猜」插件合同。组织方法见 [okf-practice](maps/okf-practice.md)。

# 第一次来这台机器

人把 README 里的一句话交给任意外部 Agent。Agent 跑 `dshx setup --harness <checkout>`（先 `--dry-run` 也可以）。不要启动或杀掉 `dsh`。细节见 [setup-workshop](playbooks/setup-workshop.md)。

# 你也有一套进程外工具

`dshx` 补的是 Creator Mode 缺的能力：落盘交付、生命周期分类、隔离 cold boot、受控宿主管理和会话伤疤诊断。

```sh
dshx help
dshx loop
dshx which
```

工作台源码在 `tools/dshx/`。它 **不是** `@deepseek-ai/dsh` 的一部分，也 **不是** 官方 `dsh doctor`（官方没有这个命令）。

# 五分钟决策树

1. 要写 **可交付** 的插件 → 落盘到 `my-plugins/<name>/`，用 [external loop](playbooks/external-loop.md)。
2. 只想在活进程里探针运行时 → 可以用 Creator Mode 的 `cordis_inspect_*`，但 [不要把内存包当交付物](pitfalls/creator-memory.md)。
3. 涉及 ship / HMR / refresh / restart → 先读 [live activation matrix](contracts/live-activation.md)，再运行 `activation-plan --change <branch>`。
4. 想证明插件能独立冷启动 → `dshx verify-boot`；它不是现有 Host 的 live proof，也不会停现有 Host。
5. 会话 400 / 卡 running → [新开会话](playbooks/new-session.md)，不要在伤疤上重试。
6. 模型超时 / retry 预算耗尽 → [symptoms](maps/symptoms.md) → [llm-retry](contracts/llm-retry.md)；RC8 默认五次，不要沿用 rc.7 的两次记忆，也不要先改 Harness 核心。
7. 只要一次性任务、不要 Web UI → [headless-boot](playbooks/headless-boot.md)。
8. `dshx check` 因插件形态 / 绝对路径 / client artifact 红了 → [check-plugin](playbooks/check-plugin.md)；RC8 外部 client 的 workspace manifest 报错 → [client-build](contracts/client-build.md)。

# 权威顺序

见 [authority](contracts/authority.md)。冲突时：

1. 源码里实际 `defineTool({ name })` / `registry.ts` / `profile.ts`
2. 已发布文档站（`website/docs.ts` 列了的那些）
3. 仓库 docs
4. 本 bundle 的综述
5. Creator skill / 过时 README / 社区帖

# 下一步

- 理解为什么要出仓开发：[why-external](why-external.md)
- 最小插件合同：[plugin-forms](contracts/plugin-forms.md)
- rc.7 起延续到 rc.8 的设置卡片：[settings-card](contracts/settings-card.md)
- 开写：[init-plugin](playbooks/init-plugin.md)
