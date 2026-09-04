# dshx

[中文](README.md) · [English](README.en.md)

DeepSeek Harness 的进程外插件工作台。给 Cursor、Claude Code、Codex、Grok 和人用。

官方 Creator Mode 适合在活进程里探针。dshx 管另一半：把插件写成文件、检查合同、看这次改的是哪一层，再决定要不要重启 Host、刷新页面。**不是 `dsh`，不是 Harness 的 fork，也不是 Creator Mode 的替代品。**

0.7.4 的事务化更新助手把官方 release、候选构建、插件冷启动、完整 Web 组合图和精确回滚分阶段过门。它**不会**替你重启正式 Host。

![本机 xfce4-terminal：先 `dshx update plan`（rc.8 → rc.2），再 `dshx update verify --target dsh-v0.1.1-rc.2`，hello 插件 cold-boot 通过](docs/screenshots/update-plan.gif)

*2026-08-25 · 机器 `cursor`（Linux）· `dshx update plan` → `dshx update verify --target dsh-v0.1.1-rc.2`*

上面是本机刚跑过的 CLI。Harness 在 `dsh-v0.1.0-rc.8`，依赖已装，所以 `doctor` 的 `dump-config` 能过。官方 Web UI 没有起来，所以没有官方窗口。`dump-config` 退出 0 不是 boot 证明。

## 装上就能用

```sh
cd /path/to/deepseek-harness
git clone https://github.com/aa2246740/dsh-external-plugin-devkit.git tools/dshx
node --import tsx/esm tools/dshx/src/cli.ts setup --harness "$PWD"
dshx which && dshx doctor
dshx update plan
```

`setup` 只装用户 launcher 和 skill，记住这个 checkout。不改 Harness 的 `package.json`，也不启停 DSH。多个 checkout 同时在场时加上 `--harness`。

把上面这段交给 Agent 也行；`dshx setup --print-prompt` 会打出完整说明。

## 它实际长这样

同一次本机演示。官方界面没开。

`setup` 装好 launcher，不碰 Host：

![dshx setup：launcher、skill、checkout 都 OK；写明不会启停 dsh](docs/screenshots/setup.png)

*2026-08-25 · 机器 `cursor`（Linux）· `dshx setup`*

`which` 说出这次用的是哪份 Harness、哪份 dshx：

![dshx which：0.7.0，Node v22.22.2，Harness 来自 config](docs/screenshots/which.png)

*2026-08-25 · 机器 `cursor`（Linux）· `dshx which`*

`doctor` 是工作台诊断，不是官方 `dsh doctor`（那个命令不存在）：

![dshx doctor：Node、dump-config 135 行通过；dump-config 不是 boot 证明；没有在监督 Host](docs/screenshots/doctor.png)

*2026-08-25 · 机器 `cursor`（Linux）· `dshx doctor`*

`check` 看的是落盘合同。刚 `init` 出来的 `hello` 可以通过：

![dshx check hello：manifest、named apply、boot marker、相对路径 overlay 全部 OK](docs/screenshots/check.png)

*2026-08-25 · 机器 `cursor`（Linux）· `dshx check hello`*

`activation-plan` 只读盘上事实，然后只选一个变更面。这次是 `patch`：热重组，不重启 Host：

![dshx activation-plan hello --change patch：activation-method 是 watched cordis.patch.yml；host-restart / browser-reload 都是 not-required](docs/screenshots/activation-plan.png)

*2026-08-25 · 机器 `cursor`（Linux）· `dshx activation-plan hello --change patch`*

## 0.7.4 更新助手与 RC1 Web 门禁

更新不是一次 `git pull`。分阶段门禁；省略 `--target` 时会实时查询官方最新 `dsh-v*` release。

```sh
dshx update plan
dshx update prepare --target dsh-v0.1.2-rc.1
dshx update verify --target dsh-v0.1.2-rc.1
dshx update apply --target dsh-v0.1.2-rc.1
dshx update rollback --target dsh-v0.1.2-rc.1
```

下面的截图是历史 RC2 样例：本机从 `0.1.0-rc.8` 规划到 `0.1.1-rc.2`，1 个插件入账，没有监督中的 Host。它不替代当前 target 的候选结果：

![dshx update plan：current 0.1.0-rc.8 → target 0.1.1-rc.2；无 tracked dirty；1 个插件](docs/screenshots/update-plan.png)

*2026-08-25 · 机器 `cursor`（Linux）· `dshx update plan`*

`plan` / `prepare` 同时盘点 `my-plugins` 和活动 Web profile 里的本地 `file:` / `link:` 插件；同名或同一稳定 plugin ID 时以 profile 正在使用的源为准，缺失目标会明确告警且不会把过期副本装进候选环境。两个活动 profile 包如果声明同一 ID，会在 plan 阶段失败关闭，避免等到组合 Web 才崩。需要验证一个不能改动的旧活动源的兼容实现时，可在 `plan` / `prepare` 重复传入 `--plugin-source name=/absolute/compatible/source`；替代源必须保持同一 package name 与 plugin ID，且只进入 candidate staging，`apply` 会明确拒绝，直到你自行把该源码提升为活动 profile 源。`prepare` 在隔离 worktree 冻安装并完整构建目标 Harness，再复制构建全部插件；不切换当前 checkout。插件构建期间 `DSHX_HARNESS` 固定为 candidate，外部 client adapter 读取目标版本的 `platform.ts`，不会经由 dshx 符号链接误用当前旧 checkout 的平台表。`verify` 先冷启动无插件的 Web candidate，再对全部候选插件逐个做静态合同和隔离冷启动，最后只按当前 Web profile 的本地依赖与 `dsh.profile.bundles` 组合活动插件图；休眠的旧实现仍会单独验证，但不会被强行与互斥的新实现共载。probe 使用包声明的 `exports["./client"]` `.js` lazy-CJS 入口，不硬编码 `lib/`。RC1 的 Web 页必须先用启动 URL 的 token 换取本地 cookie，之后才读取 `globalThis["__DSH_BOOT__"]` 和每个 bundle；裸 `HTTP 200/401` 都不算 client 验收。

![dshx update verify：candidate 构建通过；hello build/check/cold-boot 全 true；1/1 verify-gate；源插件字节未改](docs/screenshots/update-verify.png)

*2026-08-25 · 机器 `cursor`（Linux）· `dshx update verify --target dsh-v0.1.1-rc.2`*

`apply` 只接受完整候选门禁（包括 vanilla 与组合 Web），拒绝正在监督的 Host，事务化切到 `dshx/<release>` 并留下精确备份。`rollback` 恢复升级前的分支、依赖和插件 `lib/`。

三件事情不要混：

- **升级完成** — checkout 已切到目标 tag，备份落在 `.dshx/update-assistant/`
- **真实运行时验收** — 你自己跑 Host / 浏览器，看到行为
- **正式激活** — 按 `activation-plan` 选中的那一条分支挂上

更新助手不重启正式 Host。详细合同见 [knowledge/contracts/harness-update.md](knowledge/contracts/harness-update.md)。

## 没有万能热重载

改 watched patch、下次启动的 bundle、用户 preset、已经在页面里的 client、新的 client 入口、服务端模块，或只是拷了产物——这七种不是同一个动作。默认保持同一个 DSH PID。普通 dependency 不是 `manifest`，也不是重启理由。

```sh
dshx kb cat contracts/live-activation
dshx activation-plan <plugin> --change patch
```

## 日常

```sh
dshx init demo --kind function
dshx check demo
dshx activation-plan demo --change patch
```

DSHX 0.7.4 把 App、直接 `dsh web` 和 dshx 统一成启动入口，而不是三套 Host。`dshx start web` 先按真实 `DSH_HOME` 发现进程：已有一个就附着且不 spawn；多个或 Home 无法证明就失败关闭，换端口和 `--force` 都不能绕过。PID/端口的 `EPERM` 是 unknown，不再误报死亡或关闭。`verify-boot` 改用临时 Home，允许正式 Host 原 PID 继续运行，验完必停临时 Host 并清理；RC1 client graph 会走启动 token → 本地 cookie 的真实请求链；`--keep` 已禁用。

DSHX 0.7.3 修复 bundle 插件卸载顺序。外部 supervisor 使用 `dshx plugin remove <package> --profile web --port <当前端口>`：先让当前 `__DSH_BOOT__` 同 PID 脱载，再调用官方 remover，绝不先删 `client.js` 留旧 Loader 图。旧 boot 期间会保留精确 disable；用户以后正常重开 DSH.app 后重跑同一命令，只有证明新 Host 从干净 profile 启动才清掉它。命令还能续跑“dependency 已没、旧 live 图仍在”的半删除状态。Creator+ watched 插件仍走固定 `dshx_remove_plugin`，两条路径都不重启 Host、不删除源码。

需要隔离冷启动证明时才 `verify-boot`。需要把包装进 profile 时才 `sync-artifact`——它只会告诉你 `ARTIFACT_SYNCED; LIVE_ACTIVATION_UNPROVEN`。

可选的 Creator Mode+ 是一个用户 preset，只暴露七个固定工具。见 [knowledge/contracts/creator-mode-plus.md](knowledge/contracts/creator-mode-plus.md)。

更多：[从这里开始](knowledge/start-here.md) · [为什么出仓](knowledge/why-external.md) · [命令一览](knowledge/references/dshx-cli.md) · [站岗说明](AGENTS.md)

## 许可

MIT。DeepSeek Harness 是另一个项目。这里和 DeepSeek 没有隶属关系。
