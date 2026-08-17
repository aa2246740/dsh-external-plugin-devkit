---
type: Playbook
title: Open a new session after a scar
description: CLOSED error 的孤儿 tool_call 让同一会话永久 400。官方出路是新会话或 headless。
tags: [session, 400, recovery]
aliases: [new session, 新会话, 新对话, continue, regenerate]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: disc-1544
    resource: https://github.com/deepseek-ai/deepseek-harness/discussions/1544
    title: Orphan tool_call 400
  - id: disc-2034
    resource: https://github.com/deepseek-ai/deepseek-harness/discussions/2034
    title: Permanently un-resumable
---

# 识别

```sh
pnpm dshx session list
pnpm dshx session inspect <id>
```

`orphan tool_call` = 日志里 `tool/call` 没有对应 `tool/result`，且回合可能已经 `turn/end reason:error`。

`session list` 在没有孤儿时也会写一句站立政策（新会话 / headless，不要 Continue）。那不是说当前这些日志已经破了。

# 官方动作

- 新开 Web 会话
- 或 `dsh --profile headless "…"`（出厂 one-shot，新建持久化 Agent）。工作台验证插件用 [headless-boot](headless-boot.md)，不要和这篇急救混成一件事。
- 活 running：宿主还在就 `session.cancel` / `Agent.cancel`
- OPEN 尾回合：下次 load 的 interrupted 修复

# 不要

- 在伤疤会话点 Continue / regenerate
- 手改 JSONL 却当成官方修复
- 把社区 sanitizer 写成合同

详见 [orphan-tool-call](../pitfalls/orphan-tool-call.md)。
