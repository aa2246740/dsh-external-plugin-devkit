---
type: Runtime Contract
title: RC8 external client build boundary
description: RC8 官方 clientBundle 只发现 packages/*/*；my-plugins 外部包使用 dshx externalClientBundle 保留 lazy-CJS、共享模块、CSS 和 HMR 合同。
tags: [client, build, rc8, tsdown, external-plugin]
aliases: [clientBundle, externalClientBundle, rc8 external client, packages glob, my-plugins build, no packages manifest]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.8, sha: 141eb6fef83422698aef7a981029e843e8161534, date: 2026-08-20 }
sources:
  - id: official-client-build
    resource: packages/client/tsdown.client.ts
    title: Official repository client bundle preset
  - id: platform-table
    resource: packages/client/web/src/platform.ts
    title: Shared browser module table
  - id: browser-boot
    resource: packages/client/web/src/boot.ts
    title: RC8 browser boot graph
  - id: dshx-client-build
    resource: tools/dshx/src/client-build.js
    title: External package compatibility adapter
---

# 边界，不是报错绕行

RC8 官方 `packages/client/tsdown.client.ts` 的 `clientBundle()` 是仓库内部
workspace preset。它按包名扫描 `packages/*/*/package.json`，所以
`my-plugins/<name>` 即使有正确 `package.json`，也会报：

```text
tsdown: no packages/*/*/package.json declares the name <id>
```

不要改 Harness 核心、不要把 scratch 插件搬进 `packages/`、也不要扩大
官方 glob。外部插件属于另一条分发边界。

# dshx 的 RC8 适配器

`dsh-external-plugin-devkit/client-build` 导出的 `externalClientBundle()` 从
正在构建的外部包根读取 manifest，同时复用 RC8 的平台模块清单，并保持：

- Host half 为 ESM，生产依赖保持外部引用；
- browser half 为 `lib/client.js` lazy-CJS；
- `window.__ModuleLoader__.load({ id, factory })` 注册；
- React、Cordis 和其他共享模块保持同一运行时 identity；
- CSS Modules、全局 CSS 与 `?inline` CSS 由插件拥有并可随 fiber 清理；
- 未声明的 `@deepseek-ai/*` runtime import 失败关闭，避免把服务 identity 私自打包进去。
- client entry 直接读取的 `ctx.<service>` 必须出现在该入口导出的 Cordis `inject` 中；构建和 `dshx check` 都会在产物进入 Host 前拒绝缺项。

它是 dshx 的非官方兼容层，不是对官方私有 build helper 的重新命名。每次
DSH RC 升级都要重新对照官方 preset、`platform.ts` 和真实 WebUI。

# 两个 inject 不可互换

`export const inject = ['locale']` 是 Cordis 运行时服务依赖，决定插件读取
`ctx.locale` 是否合法。`package.json` 中的 `dsh.client.inject` 是 client package
之间的信息边，只用于 manifest/HMR 元数据；把 `locale` 或提供 locale 的包名只写到
这里，仍会在 Loader apply 阶段报 `cannot get property "locale" without inject`。

`externalClientBundle()` 在构建配置求值时检查标准 client source，`dshx check`
在激活前重复检查。诊断会明确要求修改 entry-level `export const inject`，而不是
修改 package manifest。

# 最小构建合同

外部 CLI 的 `dshx init <name> --kind client` 在 Harness `my-plugins` 内生成相对
adapter 配置。Creator+ 的 `dshx_scaffold` 则在可信会话工作区生成等价的便携配置：
它从 `DSHX_HARNESS` 或 `~/.config/dshx/harness` 解析唯一 checkout，再加载同一
`externalClientBundle()`，不会把本机绝对路径写进项目。

Harness 内形状为：

```ts
import { externalClientBundle } from '../../tools/dshx/src/client-build.js'

export default externalClientBundle('<name>', ['lib/types/<name>.js'], {
  clientEntry: 'src/client/index.tsx',
})
```

Harness 内从根执行：

```sh
pnpm --dir my-plugins/<name> install --ignore-workspace
pnpm --dir my-plugins/<name> build
dshx check <name>
```

Creator+ 工作区 scaffold 返回源码目录后，在该目录执行：

```sh
pnpm install --ignore-workspace
pnpm build
```

Harness `my-plugins/<name>` link 已由固定 scaffold 工具建立，不需要用户补命令。

完成条件：Host half 存在、`exports["./client"]` 指向
`lib/client.js`、产物含 lazy-CJS handoff，并且 `dshx check` 无 client
contract error。到这里仍只有 `SOURCE_BUILT`，不是 live UI 证明。

# 激活仍走生命周期分支

- 当前页面已有 package id：走 `client`，观察 `rebuilt` 与同页行为。
- 第一次加入 package id：走 `new-client`，先验 Host 行，再刷新/重开页面。
- 只复制产物：仍是 `ARTIFACT_SYNCED; LIVE_ACTIVATION_UNPROVEN`。

构建边界不改变 [live activation](live-activation.md) 的 restart/reload 结论。
