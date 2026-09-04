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
2. `dshx kb cat <id>`
3. 需要原文再跟该篇 `sources`

`kb search` 只是找 id。**snippet 不是合同。**

# 模型 / 网络

| 现象 | 先读 | 然后 |
|---|---|---|
| retry 预算用尽后模型停了，没有再试提示 | [llm-retry](/contracts/llm-retry.md) | [retry-budget-exhausted](/pitfalls/two-retry-stop.md)、[diagnose-model-ux](/playbooks/diagnose-model-ux.md) |
| RC8 仍只重试两次 | [llm-retry](/contracts/llm-retry.md) | 查 provider override、旧 Host/旧包与实际错误码；RC8 默认是五次 |
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
| plugin add / ship 成功但当前 Host 没生效 | [installed-is-not-live](/pitfalls/installed-is-not-live.md) | [live-activation](/contracts/live-activation.md)、`dshx activation-plan` |
| 问热重载/热插拔/不重启该怎么做 | [live-activation](/contracts/live-activation.md) | 按 patch / manifest / preset / client / new-client / server 分支走 |
| 新增 Creator Mode / 用户 preset 是否要重启 | [activate-user-preset](/playbooks/activate-user-preset.md) | Host 不重启；名单必要时刷新；用新会话验证 |
| Creator Mode+ 支持哪些 App 壳、supervisor 是谁 | [creator-mode-plus](/contracts/creator-mode-plus.md) | 只验官方浏览器 WebUI；外部 dshx 是 supervisor |
| 多个 Creator+ 同时做插件，或插件让 Host/官方 Web Loader 失败后要自救 | [creator-guardian](/contracts/creator-guardian.md) | 不同插件并行；同插件独占；唯一归因后隔离、复活/刷新并 steer 原 session |
| Creator+ 删除插件后 DSH 冷启动失败、profile link/source 消失但 patch 还在 | [creator-guardian](/contracts/creator-guardian.md) | `dshx_remove_plugin` 先脱载再清 profile；Guardian healthy cycle 隔离 stale row，禁止 raw teardown |
| 新 client Host 已挂上但旧页面不显示 | [new-client-entry-needs-page-reload](/pitfalls/new-client-entry-needs-page-reload.md) | [add-new-client-plugin](/playbooks/add-new-client-plugin.md)，刷新/重开页面 |
| 已有 client 改完想同页面热更新 | [update-existing-client-bundle](/playbooks/update-existing-client-bundle.md) | 验 `rebuilt` + UI；不要重启 Host |
| server module 代码改了 | [restart-server-plugin](/playbooks/restart-server-plugin.md) | 无专项 module-HMR 证据就受控重启 |
| `--patch` 相对 `name` 解析错目录 | [relative-patch-name](/pitfalls/relative-patch-name.md) | [patch-overlay](/contracts/patch-overlay.md) |
| `pnpm dsh web --patch` 相对 name 找不到模块 | [relative-patch-name](/pitfalls/relative-patch-name.md) | 用 `dshx verify-boot` / `start`，不要把绝对路径写进 git |
| 已有 DSH.app / `dsh web`，又想 `dshx start` | [dshx-cli](/references/dshx-cli.md) | 附着同 Home Host，不开第二端口；multiple/unknown 时失败关闭 |
| `dshx already supervises` / 第二次 owned start | [restart-outside](/playbooks/restart-outside.md) | 先判定是否真需重启；需要时 `restart-supervised`，不要 `--force` |
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
| RC8 外部 client 构建报 `no packages/*/*/package.json` | [client-build](/contracts/client-build.md) | 用生成的 `externalClientBundle`，不要改核心 glob 或移动插件 |
| 插件配置要出现在设置 → 插件 | [settings-card](/contracts/settings-card.md) | [settings-card playbook](/playbooks/settings-card.md) |
| 设置里多了一行导航、本该只是插件配置 | [settings-card](/contracts/settings-card.md) | 不要用 `settings.section` 冒充配置卡 |
| verify 成功后还想看日志 / 留宿主 | [verify-boot](/playbooks/verify-boot.md) | 日志仍可读；`--keep` 已禁用，不能留下第二个长期 Host |
| 要挂模型面工具 | [define-tool](/contracts/define-tool.md) | [events](/contracts/events.md) |
| 官方文档太长，不知从哪读 | [okf-practice](/maps/okf-practice.md) | [official-sources](/maps/official-sources.md) |
