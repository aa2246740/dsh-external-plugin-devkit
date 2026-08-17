---
type: Playbook
title: External plugin loop
description: 用 dshx 在进程外完成读合同、写文件、检查、真 boot、重启。
tags: [workflow, dshx]
aliases: [loop, 闭环, recommended loop]
status: stable
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: first-plugin
    resource: docs/user/develop/basic/index.md
    title: Official first-plugin path
---

# 步骤

```sh
pnpm dshx kb
pnpm dshx kb cat start-here
pnpm dshx kb cat maps/symptoms
pnpm dshx init demo --kind function    # 或 --kind tool
# 外部 Agent 改 my-plugins/demo
pnpm dshx check demo
pnpm dshx verify demo                  # 唯一「真的起来了」；默认会停
pnpm dshx verify demo --keep           # 证明后留宿主
pnpm dshx start web demo               # start 本来就不关；--keep 是 verify 的旗标
pnpm dshx logs --grep '[my-plugins/demo]'
# 改代码后：
pnpm dshx restart
pnpm dshx doctor                       # profile / 会话伤疤
```

# 禁止

- 在 Creator 会话里 `kill` / `taskkill` 宿主
- 把 `cordis_define` 当发货
- 只看 dump-config 退出 0 就宣布成功
- 在已 400 的会话上 Continue
- 提交 `.env`、`.dshx/overlays/`、密钥

# 相关

- [restart-outside](restart-outside.md)
- [verify-boot](verify-boot.md)
- [init-plugin](init-plugin.md)
