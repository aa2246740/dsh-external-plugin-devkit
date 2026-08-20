---
type: Runtime Contract
title: Creator Mode+ session claims and Guardian recovery
description: Creator+ 用可信 session 身份认领插件；进程外 Guardian 记录激活事务、隔离嫌疑插件、恢复 Web Host，并把事故 steering 回原会话。
tags: [creator-mode-plus, guardian, recovery, concurrency, session, quarantine]
aliases: [Guardian, self recovery, self-rescue, 自救, 自愈, 多个 Creator+, 多会话, culprit, quarantine, steering]
status: stable
verified_against: { tag: dsh-v0.1.0-rc.8, sha: 141eb6fef83422698aef7a981029e843e8161534, date: 2026-08-20 }
sources:
  - id: creator-protocol
    resource: tools/dshx/src/internal/creator.ts
    title: Session claims, transaction journal, quarantine, and incidents
  - id: guardian-runtime
    resource: tools/dshx/src/internal/guardian.ts
    title: External health and bounded recovery decisions
  - id: creator-bridge
    resource: tools/dshx/src/creator-plus/runner.js
    title: Trusted DSH session identity and recovery steering
  - id: browser-sentry
    resource: tools/dshx/src/creator-plus/client.js
    title: Official Loader failure detection and reload fuse
  - id: browser-recovery-route
    resource: tools/dshx/src/creator-plus/index.js
    title: Same-origin Host-stamped failure route
  - id: session-start
    resource: packages/core/agent/src/runtime-types.ts
    title: Official agent session lifecycle events
---

# 承诺

只要 Creator Mode+ 会话启动，固定 bridge 就会从 `exec.agent.id` 取得不可由模型伪造的
session 身份，并让 DSH 进程之外的 Guardian 监视当前官方 Web Host。固定 bridge 不
暴露 start、stop、restart、shell、任意 argv 或任意路径参数。

Creator+ 继承的 coding shell 仍属于 DSH 内部，不是外部 supervisor。RC8 的
`shellEnv` 为每次模型 shell 调用注入受管 `DSH_SHELL=1` 与 session id；DSHX 在 CLI
入口拒绝这类 shell 发起的 mutation/process 命令。因此旧 session 即使忽略 skill，
也不能再用 raw `dshx start/stop/restart/activate/ship` 绕过固定 bridge。

Guardian 自动恢复两类可确定故障：**Web Host 进程/HTTP 失败**，以及官方 Web boot
Loader 明确报告的 `Failed to load plugins`。它不把任意 client render exception、视觉
正确性或功能正确性冒充成已自愈。

# 多会话所有权

1. 知道插件 id 后，会话在编辑前调用 `dshx_claim_plugin`。其他命名插件工具还会自动
   刷新同一认领，防止 Agent 漏掉显式步骤。
2. 一个 session 同时只认领一个插件；切换插件会释放它先前的认领。
3. 不同 session 可以并行认领不同插件，没有 Creator+ 数量上限。
4. 同一插件只允许一个 session 持有；第二个 session 失败关闭，不共享写权限。
5. scaffold、编辑、build、check 可以并行；只有 watched live activation 的短事务使用
   一把全局锁，避免 profile patch 写入交错。
6. 认领表和事故确认都用进程间原子锁与原子 rename；session dispose 会释放认领，
   异常退出还有 24 小时租约上限。

# 因果记录

`activate-new-client` 在写 watched patch 前保存：session id、call/root-call id、plugin id、
Host pid/port、事务状态，以及 patch 的精确写前快照。归因等级固定为：

| 等级 | 条件 | 动作 |
|---|---|---|
| `high` | Host 失败时该端口有 active transaction | 隔离该事务插件，steer 原 session |
| `probable` | 同端口最近 15 秒有刚结束且未恢复的事务 | 隔离该插件，明确标为 probable |
| `ambiguous` | 没有唯一短时因果事务 | 不猜插件；恢复 Host，把事故发给仍持有认领的 sessions |

已经标记为 `recovered` 的事务不会再次成为下一次崩溃的嫌疑人。

浏览器 Loader 失败使用更窄的身份链：client sentry 只向同源固定路由提交失败 entry id
和有界错误文本；Host 自己盖章 pid、parent pid 与 port。DSHX 仅在下列条件之一成立时
隔离：同端口 active transaction 精确匹配、失败 id 精确匹配一个最近未恢复事务，或
失败 id 精确匹配唯一 session claim 且该插件已存在于 watched patch。旧 Host、未知 id
或多个候选均为 `ambiguous`，不改 patch、不刷新页面。

# 恢复顺序

```text
Host pid/HTTP 失败
  -> 读取 active 或同端口最近事务
  -> 用写前快照 remove 新插入行，或 disabled 已有行
  -> 若 App/其他 supervisor 已恢复端口：不抢监听，只做隔离
  -> 否则只重启一次相同 Web target
  -> 30 秒内再次失败：打开 crash-loop fuse，不再无限重启
  -> 持久化 incident
  -> 原 session 恢复时，以 plugin-source steering 注入错误和回滚证据
  -> session 确认收到后 ack
```

```text
官方 Web Loader FAILED，Host/HTTP 仍健康
  -> 同源 sentry 上报失败 ids
  -> Host 盖章当前 pid/parent/port
  -> DSHX 用 transaction/claim 唯一归因
  -> 精确隔离一条 live row；未知或歧义时不变更
  -> 等当前 Host manifest 证明该 id 已消失
  -> 只在证明后允许浏览器刷新一次
  -> 持久化 incident，steer 原 session
```

源码不会被删除。隔离只处理嫌疑插件自己的 live composition；若另一个 session 已经
修改同一 patch，Guardian 使用事务唯一的 disabled override，不会把整份旧快照覆盖到
新文件。下一次重试只移除该唯一 override。Agent 修复、`dshx_check` 通过后才可重新走
原 activation branch。

# 不误伤正常退出

- Creator+ 不注册、不包裹 Host 的 SIGINT/SIGTERM handler。`dshx stop` / `restart-supervised`
  只对自己启动的 Host 先 disarm，再发送正常退出信号。
- 对从 App 壳或其他 launcher 领养的 Host，Guardian 同时记录 launcher pid；launcher
  已退出时不会复活其子 Host。若 Guardian 曾为该 App 启动替代 Host，该替代进程仍继承
  App 生命周期，launcher 退出时也会停止。
- `dshx stop` 与 `restart-supervised` 拒绝手工控制领养的 Host。只有检测到真实失败的
  Guardian recovery 可以启动替代 Web Host。
- 若 App 壳先恢复相同端口，Guardian 禁止创建第二个 listener，并等下一次 Creator+
  session-start 再重新武装。
- browser sentry 只识别官方 Loader 的 `FAILED`/boot failure，不把组件内异常、样式错误、
  交互错误或业务结果错误升级成自动 quarantine。

# 收到 recovery steering 后

事故消息优先于原任务。先读 incident 的归因等级、plugin、rollback 和日志；检查保留的
源码，修复并跑 `dshx_check`。不要撤销 quarantine 后原样重试，不要手改 profile 行，
不要从会话内重启 Host。
