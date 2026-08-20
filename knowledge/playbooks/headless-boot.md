---
type: Playbook
title: Boot a headless one-shot host
description: 无 Web UI 的一次性任务。用 dshx start headless --task，或 verify-boot --profile headless。不是新会话急救。
tags: [headless, start, task]
aliases: [headless, one-shot, oneshot, "--task", "headless task", "--profile headless", headless-boot, "no-ui", "no ui", noui]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T15:00:00Z }
stale_after: 2026-11-17
---

# 和「新会话」不是同一件事

[new-session](new-session.md) 里的 headless 是伤疤会话的逃生口。这里讲的是 **工作台怎么拉起 headless profile** 来验证插件。

# 命令

```sh
dshx start headless hello --task "reply with the single word pong and stop"
dshx verify-boot hello --profile headless
```

`start headless` **必须**有任务：`--task "..."`，或把任务写在参数末尾。缺任务会 usage 失败，不会偷偷变成 web。CLI 的 `--profile` / `start headless` **覆盖** `dshx.yml` 里的 `profile: web`。

`start` 成功只表示进程拉起来了。任务有没有跑完（模型 `pong` / 429）不是 boot 证明；marker 才是。

`verify-boot --profile headless` 默认任务是 `reply with the single word pong and stop`。它断言 marker（`apply()` 跑过），**不断言 HTTP**，也 **不** 要求默认 3080 空闲。活 tools 表仍不在 cold-boot 范围内。

# 启动之后

`start` 在 spawn 后立刻返回。进程可能在任务结束后自己退出。看 marker：

```sh
dshx logs --grep '[my-plugins/hello]'
```

宿主已停时，`logs` 读 `.dshx/last-host.json` 记下的那份 launcher log（headless 是 `.dshx/logs/headless.log`），不要以为默认 web log 才算数。

`status` 不会把 headless 记成「上次 workshop 占着 :3080」。headless 没有 HTTP 端口；:3080 若在听，那是别人的。

# 不要

- 用相对 `name` 的 raw `dsh --profile headless --patch`（和 web 一样，Loader `baseUrl` 仍是 `$DSH_HOME/profiles/headless/`）
- 把 headless 当成「已经在监督的 web 宿主」的热切换；若 `dshx already supervises`，明确 stop Web 后再用完整 `--task` start headless。`restart-supervised` 不重构 headless task
- 为了跑任务去 `--force` 别人的 :3080
