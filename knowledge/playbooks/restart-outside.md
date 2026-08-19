---
type: Playbook
title: Restart only the current supervised Host
description: 生命周期分支明确需要重启时，只从进程外重启当前 dshx-owned Web PID；不复活 stale state，不重构 headless task。
tags: [restart, host, supervisor]
aliases: [restart, stop, kill host, 外面重启, already supervising, already supervises, dshx stop, dshx restart, restart-supervised]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.7, sha: 99f6f02fecdb7dff40c3fbc9470f5907c29f74ca }
sources:
  - id: cli-ref
    resource: apps/cli/reference/README.md
    title: Graceful process disposal
---

# 先问是否需要

先读 [live activation](../contracts/live-activation.md)。只有 manifest / server 分支默认需要 Host restart。安全规则“只能从外面重启”不等于“每次改插件都要重启”。

# 命令

~~~sh
pnpm dshx status
pnpm dshx restart-supervised
~~~

restart 是兼容别名。命令只接受当前由 dshx 监督且仍存活的 Web PID，并复用其 profile、plugin 和 port：

- 没有 live owned PID：拒绝；不会从 last-host.json 猜目标。
- 传入另一个 plugin/profile：拒绝；改目标要显式 stop 后 start。
- headless：拒绝；one-shot task 无法可靠重构。

# 为什么不能在会话内杀

Harness 会话内 kill 宿主会让最后一次 tool/call 留在 running/orphan 状态；外面再拉起进程也不会修复那条会话。见 [host-suicide](../pitfalls/host-suicide.md)。

# 完成标准

记录旧 PID 被停止、新 PID 启动，并重新验证目标 Host 行和真实行为。仅看到 restart 命令退出 0 不算插件验收。
