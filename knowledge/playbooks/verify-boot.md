---
type: Playbook
title: Verify an isolated cold boot
description: 在临时 DSH_HOME 做静态 + dump + 独立 spawn 的 cold-boot 证明；允许现存 Host 保持原 PID，不代表当前 Host live activation。
tags: [verify, boot]
aliases: ["verify", "boot", "marker", "真启动", "--keep", "keep", "keep host", "dshx logs", "logs"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
---

# 命令

```sh
dshx verify-boot hello
dshx verify-boot hello --port 3091     # 默认 3080 被占时换这个，不要 --force
dshx verify-boot hello --timeout 90
```

# 它断言什么

1. [check](../contracts/plugin-forms.md) 静态合同
2. 创建临时 `DSH_HOME`，只在其中初始化 profile、link 并生成绝对 overlay
3. 临时 Home 的 `dump-config` 含该 id（必要，不充分）
4. 从外面 spawn 使用该临时 Home 的 `dsh`
5. 启动日志出现 `dshx.yml` 的 `marker`
6. web：`127.0.0.1:<port>` 接受 HTTP。headless **跳过**端口占用检查和 HTTP 断言（见 [headless-boot](headless-boot.md)）
7. 日志没有 `duplicate loader entry id` / `Failed to load plugins` / `cannot resolve profile bundle`

`verify-boot` 结束只会 stop **它刚启动的临时 Host**，随后删除临时 Home。现有 App、直接 `dsh web` 或 dshx Host 原 PID保持不变。`--keep` 会被拒绝，因为它会把验证进程变成第二个长期 writer。这是受控 cold-boot 计算，见 [verify-plugin-boot](../computations/verify-plugin-boot.md)。`verify` 是兼容别名。

`dshx logs` 在临时 Host 已停时仍读 `.dshx/logs/verify-*.log` 的最近启动日志。不要把「没有 supervised host」理解成日志丢了。

# 失败时

```sh
dshx logs --grep Error
dshx doctor
```

不要把 dump 退出 0 写成成功。

`verify-boot` 证明该隔离进程中 `apply()` 跑过（marker）以及 Web 在听。它 **不** 证明另一个现存 Host 已激活，也不导出活着的 tools 注册表。live 分支见 [live activation](../contracts/live-activation.md)。
