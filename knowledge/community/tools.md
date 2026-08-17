---
type: Community Note
title: Community doctor / guard / sanitizer
description: 民间工具清单与局限。先官方手段；社区栈不要当默认急救包。
tags: [community, doctor]
aliases: ["community doctor", "sanitizer", "boot-guard", "社区工具", "folk doctor"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: disc-1719
    resource: https://github.com/deepseek-ai/deepseek-harness/discussions/1719
    title: dsh doctor idea
---

# 官方先做

组成树：dump / `--patch`。会话 400：新会话。假 running：外面重启 + cancel。Creator 要留下：写文件。

# 社区（须预装，接受 rc 破坏）

| 用途 | 仓库 | 局限 |
|---|---|---|
| 急救-启动 | SaiSenBox/dsh-boot-guard | 未预装救不了这次；跳过 ≠ 卸载 |
| 急救-会话 | Leeminjing/dsh-messages-sanitizer | 改历史；只修 pairing 残留 |
| live unstick | mayf3/dsh-session-doctor | 只包一层官方 cancel |
| dump diff | asdf17128/dsh-doctor | dump 格式一变先碎 |
| 只读扫描 | moonquake2004/dsh-doctor | 开发期 |
| 预发布安装 | zoahdev/dsh-plugin-doctor | dump 过 ≠ boot |
| 毒化扫描 | zoahdev/dsh-poison-guard | 静态，不是安全边界 |

`dshx doctor` / `verify` 覆盖的是 **本仓库 scratch 开发** 的离线检查与真 boot，不替代上述任何社区插件，也不自称官方。
