---
type: Playbook
title: First-time dshx setup
description: 用一句话 prompt 或 dshx setup 把 CLI、通用 skill 和 Harness 路径装到用户机器。不启动 dsh。
tags: [setup, onboarding, skill]
aliases: ["setup", "dshx setup", "print-prompt", "one-liner", "DSHX_HARNESS", "install skill"]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-18T12:00:00Z }
stale_after: 2026-11-18
---

# 人

把 `dshx setup --print-prompt` 打出来的中文或英文第一段，交给任意外部 Agent（Cursor / Claude Code / Codex / Grok / 其它）。

# Agent

```sh
# 还没有 tools/dshx 时，先 clone 再跑（或让已有的 dshx 来 clone）
git clone https://github.com/aa2246740/dsh-external-plugin-devkit.git <harness>/tools/dshx
node --import tsx/esm <harness>/tools/dshx/src/cli.ts setup --harness <harness>
node --import tsx/esm <harness>/tools/dshx/src/cli.ts setup --dry-run
```

`setup` 会：确认唯一 checkout、必要时 clone `tools/dshx`、写根目录 `dshx` 脚本、把 `skill/dshx` 链到已有的 Agent 家、写 `~/.config/dshx/harness`。

**禁止**：启动或杀掉 `dsh`；在多个 checkout 之间猜；写死另一台机器的路径。

多个 checkout：停下来问，或要求 `--harness`。
