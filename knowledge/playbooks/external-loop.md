---
type: Playbook
title: External plugin loop
description: 外部 Agent 的完整闭环：读合同、写文件、静态 check、可选 cold boot/artifact sync、再按唯一生命周期分支激活和验收。
tags: [workflow, dshx, activation]
aliases: [loop, 闭环, recommended loop, development flow]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.7, sha: 99f6f02fecdb7dff40c3fbc9470f5907c29f74ca }
sources:
  - id: first-plugin
    resource: docs/user/develop/basic/index.md
    title: Official first-plugin path
  - id: lifecycle
    resource: /contracts/live-activation.md
    title: dshx lifecycle interpretation
---

# 步骤

1. 读 [live activation](../contracts/live-activation.md)。如果是 bug，再从 [symptoms](../maps/symptoms.md) 找对应合同。
2. 明确改动面：patch / manifest / preset / client / new-client / server / artifact，只选一个。
3. 初始化或编辑磁盘文件。

~~~sh
pnpm dshx init demo --kind function
pnpm dshx check demo
~~~

4. 需要证明插件能独立启动时才跑 cold boot。它会拒绝停掉现有 supervised Host。

~~~sh
pnpm dshx verify-boot demo
~~~

5. 需要把本地产物送进 profile 时才同步；到此不宣称 live。

~~~sh
pnpm dshx sync-artifact /absolute/path/to/package
# ARTIFACT_SYNCED; LIVE_ACTIVATION_UNPROVEN
~~~

6. 读取磁盘 inventory 并执行已选分支。

~~~sh
pnpm dshx activation-plan demo --change patch
~~~

7. 分层验收：Host tree、client manifest/load、视觉/行为分别给证据。没观测到的层不写 PASS。

# 何时重启

只在 manifest / server 分支。先 dshx status 确认当前 owned PID，再 restart-supervised。patch、已有 client HMR、新 client 的 Host 行都不应为了“保险”重启整个 Host；新 client 只需另外刷新页面。

# 禁止

- Harness 会话内 kill/restart Host
- ship --restart
- 把 dump-config、artifact copy、HTTP 200 或一次 cold boot 代替 live/browser proof
- bundle 与 user patch 重复挂载
- 提交 .env、.dshx/overlays、密钥或机器绝对路径

# 分支

- [hot-config-entry](hot-config-entry.md)
- [update-existing-client-bundle](update-existing-client-bundle.md)
- [add-new-client-plugin](add-new-client-plugin.md)
- [activate-user-preset](activate-user-preset.md)
- [restart-server-plugin](restart-server-plugin.md)
