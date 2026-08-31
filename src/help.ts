export const HELP = `dshx — DeepSeek Harness 进程外插件工作台

同 PID 是默认完成态：按运行时变更面选分支，不按命令顺手写了哪些文件选分支
  dshx kb cat contracts/live-activation
  dshx activation-plan <plugin> --change patch|manifest|preset|client|new-client|server|artifact
  dshx activate-new-client <plugin> --profile web --port <current-web-port>

分支
  patch       真实 profile/home cordis.patch.yml 被监听；Host 同 PID 热重组
  manifest    dsh.profile.bundles / package dsh.bundle 是启动时捕获的组合；需要 Host restart
  preset      用户 preset 每次重新发现；Host 不重启，使用新会话，已缓存名单时刷新页面
  client      当前页面已有 entry 的 lib/client.js；client HMR，不重启 Host、不刷新页面
  new-client  Host entry 可热挂；旧页面不采纳 graph 新行，必须刷新/重开页面
  server      Web 默认不承诺 server module HMR；无专项证据则受控重启
  artifact    只同步字节或普通依赖；本步不重启，live activation 仍未证明

分支防误判
  普通 profile dependency 只是解析前提，不是 manifest activation，也不是重启理由。
  首次 Web client 即使会写 dependency，仍走 new-client：Host 不重启，只刷新/重开页面。
  只有 activation-plan 明确给出 bundle boot-capture 或无 HMR 的 server module 证据，才授权 Host restart。

推荐闭环
  1. kb cat 对应合同；kb search 只找 id，命中后必须 cat
  2. init/edit my-plugins/<name>
  3. check <name>
  4. 需要隔离冷启动证明时 verify-boot <name>
  5. 需要 profile 产物时 sync-artifact <dir>
  6. 按 activation-plan 的单一分支激活；new-client 只用 activate-new-client
  7. 分层报告：artifact / next-boot / Host tree / client / visual behavior

命令
  help
  setup                         安装用户 launcher/skill 并记住 Harness checkout；不改核心、不启停 DSH
  kb                            ls / catalog / cat / search / lint / digest
  loop                          打印本闭环
  init <name>                   --kind function|tool|client|object|class
  check [name]                  静态合同；client 必须是 built lazy-CJS lib/client.js
  activation-plan <target>      只读 inventory；--change 选择生命周期分支
  activate-new-client <plugin>  固定顺序 link → watched patch → 当前 Host manifest；不重启、不刷新页面
  plugin remove <package>       同名 Loader id 的 bundle 安全卸载：live disable → 同 PID absence → 官方 remove
  overlay [name]                生成一次性绝对 --patch 文件；该文件不受 user-patch watcher 监听
  dump [name]                   离线合成；退出 0 不是 boot/live 证明
  verify-boot [name]            隔离冷启动：服务端 marker，或 Web client graph + bundle HTTP
  verify [name]                 verify-boot 兼容别名
  sync-artifact <dir|name>      link:/legacy file: 产物同步；live activation 未证明
  ship / recopy                 sync-artifact 兼容别名
  start [web|headless] [name]   显式启动 workshop Host
  stop                          停当前 supervised Host
  restart-supervised            只重启当前 supervised Web PID
  restart                       restart-supervised 兼容别名
  status / logs                 监督状态和 launcher log
  creator                       Bridge v2 内部协议：watch/claim/remove/recovery/disarm；无模型任意 argv
  doctor                        profile/workshop 诊断；不是官方 dsh doctor
  session list|inspect [id]
  which
  experiment
  update plan                   只读升级助手：官方目标、dirty 风险、插件矩阵与阻断项
  update prepare               隔离构建目标 Harness 与全部插件（--target / --candidate）
  update verify                静态检查并逐个冷启动候选插件，可断点续跑
  update apply                 事务化切换、全构建、插件依赖合成，并保留精确回滚
  update rollback              恢复升级前 checkout、依赖树与插件生成物

关键行为
  verify-boot 遇到正在监督的 Host 会拒绝，绝不偷偷 stop。
  restart-supervised 没有 live owned PID 时会拒绝，绝不复活 last-host.json。
  adopted 官方/App Host 不能被 stop/restart-supervised 手工控制；Guardian 只在真实失败后恢复一次。
  Creator+ session-start 自动武装 Guardian；不同插件可并行，同插件只允许一个 session 认领。
  外部 bundle 卸载不会先删包再留下旧 Loader 图；旧 boot 的临时 disable 会留到下次正常重开，再重跑同一命令清理。
  sync-artifact 成功只输出 ARTIFACT_SYNCED; LIVE_ACTIVATION_UNPROVEN。
  ship --restart 已禁用；保持当前 PID，只有带精确证据的 manifest/server 分支才显式 restart-supervised。

常用旗标
  --json
  --profile web|headless
  --port 3080
  --timeout 60
  --keep                         verify-boot 成功后保留它刚启动的 Host
  --force                        init 覆盖脚手架；start/verify 不应用来抢陌生端口
  --kind function|tool|client|object|class
  --change patch|manifest|preset|client|new-client|server|artifact
  --harness <path>              所有命令的 checkout 消歧器；显式值优先
  --dry-run / --print-prompt
  --task "..."
  --target dsh-v0.1.1-rc.2     update 的显式官方 release tag；省略时实时查询 origin
  --candidate <path>           update 候选 checkout 的显式路径

硬规则
  不在 Harness 会话里 kill/restart 宿主。
  不重复通过 bundle 和 user patch 挂同一插件。
  不把 package add、copy、dump-config、HTTP 200 当成 live/UI 证明。
  不提交 .env、.dshx、密钥、机器绝对路径。
`

export const LOOP = `外部插件开发闭环

1. 读生命周期总合同
   dshx kb cat contracts/live-activation

2. 明确改动面并只选一个分支
   dshx activation-plan <plugin> --change patch|manifest|preset|client|new-client|server|artifact

3. 写和静态检查
   dshx init <name> --kind function|tool|client|object|class
   dshx check <name>

4. 可选：隔离冷启动证明
   dshx verify-boot <name>
   它不验证现有 Host，也不会停现有 Host。

5. 可选：同步 profile 产物
   dshx sync-artifact <dir>
   到此只有 ARTIFACT_SYNCED; LIVE_ACTIVATION_UNPROVEN。

6. 执行已选分支
   patch      → kb cat playbooks/hot-config-entry
   preset     → kb cat playbooks/activate-user-preset
   client     → kb cat playbooks/update-existing-client-bundle
   new-client → activate-new-client <plugin> --profile web --port <当前端口>
   server     → kb cat playbooks/restart-server-plugin
   manifest   → 只有 boot-captured bundle composition 才在下一次 Host boot 后验证

7. 分开验收
   Host tree active 不等于 client loaded。
   client loaded 不等于 visual/behavior verified。
`
