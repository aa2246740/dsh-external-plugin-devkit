---
type: Playbook
title: Verify an isolated cold boot
description: 在没有现存 supervised Host 时做静态 + dump + 独立 spawn 的 cold-boot 证明；不代表当前 Host live activation。
tags: [verify, boot]
aliases: ["verify", "boot", "marker", "真启动", "--keep", "keep", "keep host", "dshx logs", "logs"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
---

# 命令

```sh
pnpm dshx verify-boot hello
pnpm dshx verify-boot hello --keep          # 成功后不关它刚启动的 Host
pnpm dshx verify-boot hello --port 3091     # 默认 3080 被占时换这个，不要 --force
pnpm dshx verify-boot hello --timeout 90
```

# 它断言什么

1. [check](../contracts/plugin-forms.md) 静态合同
2. 生成绝对 overlay
3. `dump-config` 含该 id（必要，不充分）
4. 从外面 spawn `dsh`
5. 启动日志出现 `dshx.yml` 的 `marker`
6. web：`127.0.0.1:<port>` 接受 HTTP。headless **跳过**端口占用检查和 HTTP 断言（见 [headless-boot](headless-boot.md)）
7. 日志没有 `duplicate loader entry id` / `Failed to load plugins` / `cannot resolve profile bundle`

默认 verify-boot 结束只会 stop **它刚启动的** Host。若 dshx 已在监督一个 live Host，命令直接拒绝，绝不会先停再验。这是受控 cold-boot 计算，见 [verify-plugin-boot](../computations/verify-plugin-boot.md)。`verify` 是兼容别名。

`dshx logs` 在宿主已停时仍读 `.dshx/logs/<profile>.log`。不要把「没有 supervised host」理解成日志丢了。

# 失败时

```sh
pnpm dshx logs --grep Error
pnpm dshx doctor
```

不要把 dump 退出 0 写成成功。

`verify-boot` 证明该隔离进程中 `apply()` 跑过（marker）以及 Web 在听。它 **不** 证明另一个现存 Host 已激活，也不导出活着的 tools 注册表。live 分支见 [live activation](../contracts/live-activation.md)。
