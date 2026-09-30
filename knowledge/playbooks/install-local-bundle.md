---
type: Playbook
title: Install a local bundle on the current RC2 Host
description: 外部 Agent 通过官方公开插件管理接口安装本地 Web/Desktop bundle，无需发布 npm。
tags: [install, local, desktop, bundle, rc2]
aliases: [本地插件, 本地安装, plugin add, link, file, npm, Claude]
status: stable
verified_against: { tag: dsh-v0.2.0-rc.2, sha: 639ed015397290b3745d163aafe02ffee4aa3f84 }
sources:
  - id: install-spec
    resource: packages/boot/plugin-manager/src/install-spec.ts
    title: Accepted local package spec forms
  - id: plugin-manager
    resource: packages/boot/plugin-manager/src/index.ts
    title: Public inspect and installBundle operations
  - id: profile-hmr
    resource: packages/boot/hmr/src/index.ts
    title: Same-Host bundle reconciliation
---

# 本地包不需要 npm

官方 RC2 插件管理器支持本地绝对路径、`link:`、`file:`、tarball 和 Git。它要求可安装的包声明 `dsh.bundle.patch`。`dsh.client` 只声明客户端产物，不能代替 bundle 声明。

外部 Agent 先构建插件并确认包的入口、patch 和 `lib/client.js` 存在。以只含一个命名函数插件的包为例：

```json
{
  "name": "my-local-plugin",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./lib/index.js", "./package.json": "./package.json" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

对应的 `cordis.patch.yml`：

```yaml
- insert:
    - id: my-local-plugin
      name: my-local-plugin
```

已有客户端包应保留其 `./client` export 和 `dsh.client` 声明。发布打包时把 patch 和编译产物加入 `files`。已有 watched 挂载的插件不能直接再加这份 bundle；先用原安装路线维护，迁移时先证明旧行已解除。

# 执行

先用 `dshx status` 核对当前 Home、profile、端口和进程。以下 Desktop 端口仅为示例，必须用发现的值：

```sh
dshx plugin add /absolute/path/to/my-local-plugin --profile desktop --port 19387 --dry-run
dshx plugin add /absolute/path/to/my-local-plugin --profile desktop --port 19387
```

Web 使用相同命令并改为实际 `--profile web --port <port>`。默认采用 `link:`，源码留在本地目录；依赖须已安装，客户端须已构建。命令只用于首次添加；重复安装会在 `inspect` 阶段拒绝，更新按变化面处理。

命令使用官方公开 Remote，保留官方 profile 锁和 package manager。它不冒用 Creator+ 的私有 Desktop 票据、不启动另一份 Host。外部认证使用已绑定且与 PID/启动时间匹配的 DSHX 私密交接，或启动器私下传入的 `DSHX_WEB_STARTUP_URL`。出现 `WEB_AUTH_REQUIRED` 时修复启动器交接，或在已登录的官方插件页填写同一个绝对路径；不要在聊天里索取 token，也不要扫描 App 日志或凭据库。

如果只有 `dsh.client`、没有 `dsh.bundle.patch`，这是 plain 开发插件。Creator+ 会话认领后调用 `dshx_activate_new_client`，由桥接处理当前 Web/Desktop profile。外部 Web 可用 `dshx activate-new-client`。不要为了 Desktop 安装把版本改成 npm 上已有版本，也不要要求先发布 npm。

# 完成标准

- 官方 manager 返回 `application: applied`，进程 PID 和启动时间不变。
- profile 的 dependency、bundle 清单和 `node_modules` 都指向该本地包。
- manager 列出已启用 bundle。
- 有客户端时，在当前页面观察 graph 同步并实际操作功能。仅成功安装不能证明 UI 正常。

`restart-required`、失败、待批准脚本或结果不确定均不是成功。请求超时后只查询同一个 request id，不自动重复安装；按具体结果处理，不用重启掩盖问题。
