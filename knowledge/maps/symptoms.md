---
type: Map
title: Symptom to concept
description: 先对现象，再 cat 合同。不要对整仓官方文档做无目的全文搜索。
tags: [index, symptoms, retrieval]
aliases: [symptom, 现象, FAQ, 超时, 重试, 400, timeout, retry, dump, 卡住, 索引]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T14:00:00Z }
stale_after: 2026-11-17
---

# 怎么用

1. 在下表找到现象
2. `pnpm dshx kb cat <id>`
3. 需要原文再跟该篇 `sources`

`kb search` 只是找 id。**snippet 不是合同。**

# 模型 / 网络

| 现象 | 先读 | 然后 |
|---|---|---|
| 超时两次后模型停了，没有再试提示 | [llm-retry](/contracts/llm-retry.md) | [two-retry-stop](/pitfalls/two-retry-stop.md)、[diagnose-model-ux](/playbooks/diagnose-model-ux.md) |
| 同一张工单里：先超时停、再 Continue 400 | 先 [llm-retry](/contracts/llm-retry.md)，再 [orphan-tool-call](/pitfalls/orphan-tool-call.md) | 两条合同，不是一个插件 bug |
| stream 空闲很久然后 TIMEOUT | [llm-timeout](/contracts/llm-timeout.md) | [llm-error](/contracts/llm-error.md) |
| 要接新模型 / provider | [llm-adapter](/contracts/llm-adapter.md) | [plugin-config](/contracts/plugin-config.md) |
| 看到 `LlmError` / `RATE_LIMIT` / `TRANSPORT` | [llm-error](/contracts/llm-error.md) | [llm-retry](/contracts/llm-retry.md) |

# 会话

| 现象 | 先读 | 然后 |
|---|---|---|
| Continue 一律 400 / orphan `tool_call` | [orphan-tool-call](/pitfalls/orphan-tool-call.md) | [new-session](/playbooks/new-session.md)、`dshx session list` |
| 会话卡「运行中」、宿主被杀 | [host-suicide](/pitfalls/host-suicide.md) | [restart-outside](/playbooks/restart-outside.md) |
| `turn/end reason:error` 会不会自愈 | [turn-error](/contracts/turn-error.md) | [persistence](/contracts/persistence.md) |
| 模型请求和日志对不上 | [session-truth](/contracts/session-truth.md) | |

# 启动 / 合成

| 现象 | 先读 | 然后 |
|---|---|---|
| dump-config 退出 0 但真实 boot 崩 | [dump-config](/contracts/dump-config.md) | [dump-false-negative](/pitfalls/dump-false-negative.md)、[verify-boot](/playbooks/verify-boot.md) |
| `duplicate loader entry id` | [duplicate-loader-id](/pitfalls/duplicate-loader-id.md) | [composition](/contracts/composition.md) |
| `plugin remove` 后 profile 起不来 | [leftover-bundles](/pitfalls/leftover-bundles.md) | `dshx doctor` |
| `file:` add 显示 Already up to date，页面仍是旧包 | [file-copy-stale](/pitfalls/file-copy-stale.md) | [ship-plugin](/playbooks/ship-plugin.md)、`dshx ship` |
| `--patch` 相对 `name` 解析错目录 | [relative-patch-name](/pitfalls/relative-patch-name.md) | [patch-overlay](/contracts/patch-overlay.md) |
| `pnpm dsh web --patch` 相对 name 找不到模块 | [relative-patch-name](/pitfalls/relative-patch-name.md) | 用 `dshx verify` / `start`，不要把绝对路径写进 git |
| 默认 3080 已被占用、dshx 没在监督 | [dshx-cli](/references/dshx-cli.md) | `dshx status`，换 `--port 3091`，不要 `--force` 去抢别人的监听 |
| `dshx already supervises` / 第二次 start | [restart-outside](/playbooks/restart-outside.md) | `dshx stop` 或 `restart`，不要 `--force` |
| 要无 UI 跑一次性任务 | [headless-boot](/playbooks/headless-boot.md) | `start headless --task` 或 `verify --profile headless` |
| `agent-preset-invalid` / 两个 tool-cordis | [preset-collision](/pitfalls/preset-collision.md) | [creator-mode](/contracts/creator-mode.md) |

# 开发方式

| 现象 | 先读 | 然后 |
|---|---|---|
| Creator 里写的插件重启消失 | [creator-memory](/pitfalls/creator-memory.md) | [why-external](/why-external.md)、[persist-files](/playbooks/persist-files.md) |
| 不知道插件该导出什么 | [plugin-forms](/contracts/plugin-forms.md) | [plugin-config](/contracts/plugin-config.md)、[init-plugin](/playbooks/init-plugin.md) |
| `export default` / check 红 | [check-plugin](/playbooks/check-plugin.md) | [plugin-forms](/contracts/plugin-forms.md) |
| 别人 clone 后不知道怎么装 | [setup-workshop](/playbooks/setup-workshop.md) | `dshx setup --print-prompt` |
| 目录已在、想覆盖脚手架 | [init-plugin](/playbooks/init-plugin.md) | `dshx init <name> --force` |
| 要一块 Web 设置/slot 脚手架 | [init-plugin](/playbooks/init-plugin.md) | `dshx init <name> --kind client` |
| 插件配置要出现在设置 → 插件 | [settings-card](/contracts/settings-card.md) | [settings-card playbook](/playbooks/settings-card.md) |
| 设置里多了一行导航、本该只是插件配置 | [settings-card](/contracts/settings-card.md) | 不要用 `settings.section` 冒充配置卡 |
| verify 成功后还想看日志 / 留宿主 | [verify-boot](/playbooks/verify-boot.md) | `--keep`，然后 `dshx logs` / `stop` |
| 要挂模型面工具 | [define-tool](/contracts/define-tool.md) | [events](/contracts/events.md) |
| 官方文档太长，不知从哪读 | [okf-practice](/maps/okf-practice.md) | [official-sources](/maps/official-sources.md) |
