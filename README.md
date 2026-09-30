# dshx

[中文](README.md) · [English](README.en.md)

**插件开发红线：DSH 官方源码只读。** 不为插件修改 Host、内置包或官方构建产物，临时副本和 worktree 也不例外。缺少公开接口时调整插件方案；`CORE_SOURCE_IMMUTABLE` 不可通过接管、审批或 `--force` 绕过。

**这不是 Host 功能插件。** 不要用 `dsh plugin add` 装本仓库，也没有 `github:aa2246740/dsh-external-plugin-devkit` 这种 Host 安装命令。

只跑官方 DeepSeek Harness（例如 **0.2.0-rc.2**）、不写插件的人：**跳过这个仓库。** 官方原装 DSH 没有 Creator Mode，也没有 DSHX；功能插件的安装写在那个插件自己的 README 里。

本仓库是 **dshx CLI / 工作台**。给**手里有一份 [Harness checkout](https://github.com/deepseek-ai/deepseek-harness)、要在仓外写或维护文件插件**的作者用（Cursor、Claude Code、Codex、Grok，或人自己跑）。

官方 Creator Mode 适合在活进程里探针。dshx 管另一半：把插件写成文件、检查合同、看这次改的是哪一层，再决定要不要重启 Host、刷新页面。**不是 `dsh`，不是 Harness 的 fork，也不是 Creator Mode 的替代品。**

0.9.5 新增官方 Web/Desktop 本地 bundle 安装，并按 RC2 的 profile HMR 与 client graph 同步能力修正激活判断。`update plan` 保留只读盘点；修改 Harness 的更新阶段已禁用。

## npm 命令入口

```sh
npx --yes dsh-external-plugin-devkit@0.9.5 --version
npx --yes dsh-external-plugin-devkit@0.9.5 --help
```

npm 包现在用 JavaScript 入口加载自带的 `tsx` 依赖，解决 Node.js 无法直接执行 `node_modules` 中 TypeScript 入口的问题。实际开发仍需下面的 Harness 工作台配置；不要把 DSHX 当功能插件安装进 Host。

## 0.9.2：工作台钉到 0.2.0-rc.2

工作台默认目标为 `dsh-v0.2.0-rc.2`（SHA `639ed015397290b3745d163aafe02ffee4aa3f84`，官方包 `@deepseek-ai/dsh@0.2.0-rc.2`）。`@deepseek-ai/dsh` peer 为 `>=0.2.0-rc.1 <0.2.1`：接受该 RC，拒绝 `0.2.0` alpha。官方客户端 `INLINE_SAFE` 与 `0.1.7-rc.2` 相同。

## 0.9.1：RC2 与桌面支持

0.9.1 的默认目标是 `dsh-v0.1.7-rc.2`。桌面支持包括 Host 身份识别、desktop profile 选择、热替换事务，以及只输出条目身份的只读配置检查。Guardian 将桌面恢复交给 App。

桌面 profile 的安装和卸载需要当前 Creator+ 的固定工具及 Host 签发的能力凭据；外部 CLI 不会绕过这个入口。Web 与桌面 profile 分别验证，具体插件仍需按变更面完成激活和行为检查。

## 作者：装工作台

先有一份本机 Harness checkout，再把本仓库 clone 进它的 `tools/dshx`，用 dshx 自己的 `setup`。**不是** `dsh plugin add`。

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

## Harness 版本检查

`dshx update plan` 只读盘点当前版本、官方目标版本、工作树状态和插件清单；它不证明目标版本或插件通过验收。

`update prepare`、`verify`、`apply`、`rollback` 已禁用，会返回 `CORE_SOURCE_IMMUTABLE`。DSHX 不创建官方源码候选、不重建或切换 Harness，也不替换官方文件。官方应用升级应作为独立维护任务处理。详见 [插件边界](knowledge/contracts/plugin-only.md)。

## 没有万能热重载

改 watched patch、profile bundle、用户 preset、已经在页面里的 client、新的 client 入口、服务端模块，或只是拷了产物——这七种不是同一个动作。默认保持同一个 DSH PID。普通 dependency 不是 `manifest`，也不是重启理由。

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

DSHX 0.9.2 的内置 Creator Mode+ 是一个用户 preset，提供九个固定工具。独立 Creator+ 0.3.8 另提供 `dshx_browser_open`，共十个。发生认领冲突时，在当前对话调用 `dshx_request_takeover`；用户确认后会停止旧任务并接管，无需找回旧对话。见 [knowledge/contracts/creator-mode-plus.md](knowledge/contracts/creator-mode-plus.md)。

更多：[从这里开始](knowledge/start-here.md) · [为什么出仓](knowledge/why-external.md) · [命令一览](knowledge/references/dshx-cli.md) · [站岗说明](AGENTS.md)

## 许可

MIT。DeepSeek Harness 是另一个项目。这里和 DeepSeek 没有隶属关系。

## 浏览器认证与 Agent 自测

用 `dshx browser status` 检查当前 Host 的访问状态。Creator watch/claim 会通过官方 Connection 自动交接认证；没有 Creator 的官方 CLI 用户，可用 `browser bind` 从私密环境变量 `DSHX_WEB_STARTUP_URL` 绑定启动链接。不要把带 token 的链接写进命令参数或聊天。

`browser open` 使用 `DSHX_BROWSER_ADAPTER` 指定的可执行适配器，通过 stdin 私密传入认证信息。具体适配协议、凭据有效期和随包提供的 Codex 双浏览器上下文测试见[浏览器访问合同](knowledge/contracts/browser-access.md)。HTTP 认证、浏览器访问和具体功能验收分别报告。

### Creator Shell 回归验证

修改 Creator 守卫后，运行 `DSHX_HARNESS=<absolute-checkout> npm run test:native`。测试使用真实 Cordis、Agent、工具和沙箱，在临时本地 Git 仓库完成提交、打标签与推送；不需要 GitHub 凭据。沙箱不可用时测试失败，不回退到无隔离执行。

## RC2 本地插件安装

官方 Desktop 支持本地包，无需先发 npm。构建完成且 `package.json` 声明 `dsh.bundle.patch` 后：

```sh
dshx plugin add /absolute/path/to/plugin --profile desktop --port <当前端口>
```

命令使用当前 Host 的官方插件管理接口和私密认证交接。RC2 能在相同进程内合成新 bundle，并把新 client 行同步到当前页面。仍须操作插件验证功能。Creator+ 的 plain 开发插件继续认领后调用固定 `dshx_activate_new_client`，不要重复 bundle 挂载。详见 [本地安装](knowledge/playbooks/install-local-bundle.md)。
