---
type: Playbook
title: Install Codex-style $skill
description: 把 examples/codex-skill 拷进 my-plugins，按 patch 分支激活宿主 $name 手势；client 菜单是另一步。
tags: [skill, dollar, codex, patch]
aliases: ["install $skill", "codex-skill", "美元符号", "skill dollar"]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.8, sha: 141eb6fef83422698aef7a981029e843e8161534 }
sources:
  - id: contract
    resource: /contracts/codex-skill.md
    title: $skill contract
  - id: example
    resource: examples/codex-skill/README.md
    title: Example plugin
---

# 步骤

1. 先读 [codex-skill](../contracts/codex-skill.md)。Codex **不用** `/skill-name` 调 skill。
2. 分类：宿主手势是 **patch**。`$` 弹出菜单是核心补丁，不是这条 playbook。

```sh
cp -R tools/dshx/examples/codex-skill my-plugins/codex-skill
dshx check codex-skill
dshx activation-plan codex-skill --change patch
```

3. 用 `dshx start web codex-skill` 或改活动 profile 的 watched `cordis.patch.yml`。不要手写机器绝对路径进 git。
4. 日志出现 `[my-plugins/codex-skill] loaded` 只证明 `HOST_TREE_ACTIVE`。
5. 新开或仍空白的会话里发送 `$<已有 skill 名> please`。模型步应出现官方同款 `<skill_content>`。这才是 `VISUAL_BEHAVIOR_VERIFIED`。

# Client（可选）

`src/client/index.tsx` 在 `@` 菜单里列出 skill，选中后插入 `$name `。这是 **new-client** 分支：先按 [client-build](../contracts/client-build.md) 搭 scaffold 和 `lib/client.js`，再走 [add-new-client-plugin](add-new-client-plugin.md)，然后刷新页面。

# 不要

- 不要在 Creator Mode 会话里 `cordis_define` 这份源码当交付。
- 不要从会话内重启 Host。
- 不要把 skill 注册成 `/` 命令。
