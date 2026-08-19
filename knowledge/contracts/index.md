# Runtime contracts

先合同，后教程。Skill 与 `defineTool` 冲突时丢弃 skill。一篇只讲一件事；LLM 重试和超时是两篇。

# 权威与形态

* [Authority](authority.md) - 谁说了算
* [Plugin forms](plugin-forms.md) - Function / Object / Class
* [Plugin Config](plugin-config.md) - Schemastery `Config`，不要普通对象
* [Settings cards](settings-card.md) - rc.7 `installSettingsSection` + `settings.plugin.item`

# 工具与事件

* [defineTool](define-tool.md) - 模型面工具
* [Events](events.md) - 五种 dispatch 与 turn 流
* [tool-cordis names](tool-cordis.md) - 七个工具名

# 合成与验证

* [Composition](composition.md) - profile / bundle / patch
* [dump-config](dump-config.md) - 离线拼树，不挂 Loader
* [patch overlay](patch-overlay.md) - `--patch` 与绝对 name
* [Testing](testing.md) - 真实 composition 测试

# Session

* [Session truth](session-truth.md) - Model-visible means logged
* [Persistence](persistence.md) - 中断回合与 JSONL
* [Turn error](turn-error.md) - CLOSED `reason:error` 不会自愈
* [Creator Mode](creator-mode.md) - preset `cordis`

# LLM（观察实验里搜索为零的那一块）

* [LLM retry](llm-retry.md) - `dsh-llm-retry`，默认两次
* [LLM timeout](llm-timeout.md) - `streamIdleTimeoutMs` / `TIMEOUT`
* [LlmError](llm-error.md) - 稳定码，路由不看 message
* [LLM adapter](llm-adapter.md) - `registerAdapter` 与 policy 所有权
