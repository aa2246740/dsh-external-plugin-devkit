---
type: Runtime Contract
title: Profile, bundle, and patch layers
description: 空列表合成顺序；patch 整行替换 config；--patch 不改 Loader baseUrl。
tags: [profile, bundle, patch]
aliases: ["profile", "bundle", "cordis.yml", "合成"]
status: stable
resource: packages/boot/app-boot/src/profile.ts
generated: { by: dshx/grok-4.6, at: 2026-08-17T12:30:00Z }
stale_after: 2026-11-17
sources:
  - id: profile-ts
    resource: packages/boot/app-boot/src/profile.ts
    title: composeEntries
  - id: cli-ref
    resource: apps/cli/reference/README.md
    title: CLI behavior reference
  - id: architecture
    resource: docs/architecture.md
    title: Profiles and bundles
---

# 合成顺序

`composeEntries()` 从空列表开始，后层按行胜出。针对 `id` 的 patch **整份替换**该行 `config`（非深合并）。`insert` 加行。

| 顺序 | 层 |
|---|---|
| 1 | bundle（web：`dsh-base` → `dsh-web-app`；headless：`dsh-base` → `dsh-headless`） |
| 2 | `$DSH_HOME/profiles/<name>/cordis.patch.yml` |
| 3 | `$DSH_HOME/cordis.patch.yml` |
| 4 | 每个 `--patch`（argv 序，可重复） |

缺 overlay 文件即抛错。`--patch` **不改变** 用于模块解析的 profile 目录。

# 两个清单

- **bundle**：`package.json` 的 `dsh.bundle.patch` —— 这个包贡献哪一层。
- **profile**：`dsh.profile.bundles` —— 这个可启动组合叠哪些 bundle。

二者不是同一物。`dsh plugin add` 成功后会把声明了 `dsh.bundle` 的依赖提升进 bundles。原先手写的 `insert` 不会自动删，于是 [duplicate loader id](../pitfalls/duplicate-loader-id.md)。

Host 启动时读取并展开 bundle 层；运行中的 user-patch watcher 复用这份已捕获的 bundle patches，只重读 profile/home `cordis.patch.yml`。所以 manifest / bundle 文件变更是 **next boot**，用户 patch 行才是同进程热重组面。见 [live activation](live-activation.md)。

# 看树

```sh
pnpm dsh --profile web --dump-default-config   # 只 bundle
pnpm dsh --profile web --dump-config           # 再叠用户层
dshx dump hello                           # 带 scratch overlay，并警告这不是 boot
```
