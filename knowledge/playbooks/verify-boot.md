---
type: Playbook
title: Verify a real boot
description: dump 里有 id 只是第一步。apply 的 marker 和（web）HTTP 才算起来。
tags: [verify, boot]
aliases: ["verify", "boot", "marker", "真启动", "--keep", "keep", "keep host", "dshx logs", "logs"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
---

# 命令

```sh
pnpm dshx verify hello
pnpm dshx verify hello --keep          # 成功后不关
pnpm dshx verify hello --port 3091     # 默认 3080 被占时换这个，不要 --force
pnpm dshx verify hello --timeout 90
```

# 它断言什么

1. [check](../contracts/plugin-forms.md) 静态合同
2. 生成绝对 overlay
3. `dump-config` 含该 id（必要，不充分）
4. 从外面 spawn `dsh`
5. 启动日志出现 `dshx.yml` 的 `marker`
6. web：`127.0.0.1:<port>` 接受 HTTP。headless **跳过**端口占用检查和 HTTP 断言（见 [headless-boot](headless-boot.md)）
7. 日志没有 `duplicate loader entry id` / `Failed to load plugins` / `cannot resolve profile bundle`

默认 verify 结束会 `stop`。这是受控计算，见 [verify-plugin-boot](../computations/verify-plugin-boot.md)。

`dshx logs` 在宿主已停时仍读 `.dshx/logs/<profile>.log`。不要把「没有 supervised host」理解成日志丢了。

# 失败时

```sh
pnpm dshx logs --grep Error
pnpm dshx doctor
```

不要把 dump 退出 0 写成成功。

`verify` 证明 `apply()` 跑过（marker）以及 web 在听。它 **不** 导出活着的 tools 注册表。`--kind tool` 的 `defineTool` 是否挂上，看源码 + `dshx check` 的 `inject-tools`，需要活证据就自己在新会话里调那个工具。
