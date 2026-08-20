export const HELP = `dshx — DeepSeek Harness 进程外插件工作台

先判生命周期，不要把“热重载”当成一个动作
  dshx kb cat contracts/live-activation
  dshx activation-plan <plugin> --change patch|manifest|preset|client|new-client|server|artifact

分支
  patch       真实 profile/home cordis.patch.yml 被监听；Host 同 PID 热重组
  manifest    package.json / dsh.profile.bundles 是下次启动组合；需要 Host restart
  preset      用户 preset 每次重新发现；Host 不重启，使用新会话，已缓存名单时刷新页面
  client      当前页面已有 entry 的 lib/client.js；client HMR，不重启 Host、不刷新页面
  new-client  Host entry 可热挂；旧页面不采纳 graph 新行，必须刷新/重开页面
  server      Web 默认不承诺 server module HMR；无专项证据则受控重启
  artifact    只同步字节；不决定 restart/reload

推荐闭环
  1. kb cat 对应合同；kb search 只找 id，命中后必须 cat
  2. init/edit my-plugins/<name>
  3. check <name>
  4. 需要隔离冷启动证明时 verify-boot <name>
  5. 需要 profile 产物时 sync-artifact <dir>
  6. 按 activation-plan 的单一分支激活
  7. 分层报告：artifact / next-boot / Host tree / client / visual behavior

命令
  help
  setup                         安装 launcher/skill 并记住唯一 Harness checkout；不启停 DSH
  kb                            ls / catalog / cat / search / lint / digest
  loop                          打印本闭环
  init <name>                   --kind function|tool|client|object|class
  check [name]                  静态合同；client 必须是 built lazy-CJS lib/client.js
  activation-plan <target>      只读 inventory；--change 选择生命周期分支
  overlay [name]                生成一次性绝对 --patch 文件；该文件不受 user-patch watcher 监听
  dump [name]                   离线合成；退出 0 不是 boot/live 证明
  verify-boot [name]            隔离冷启动：check + dump + marker + HTTP
  verify [name]                 verify-boot 兼容别名
  sync-artifact <dir|name>      link:/legacy file: 产物同步；live activation 未证明
  ship / recopy                 sync-artifact 兼容别名
  start [web|headless] [name]   显式启动 workshop Host
  stop                          停当前 supervised Host
  restart-supervised            只重启当前 supervised Web PID
  restart                       restart-supervised 兼容别名
  status / logs                 监督状态和 launcher log
  doctor                        profile/workshop 诊断；不是官方 dsh doctor
  session list|inspect [id]
  which
  experiment

关键行为
  verify-boot 遇到正在监督的 Host 会拒绝，绝不偷偷 stop。
  restart-supervised 没有 live owned PID 时会拒绝，绝不复活 last-host.json。
  sync-artifact 成功只输出 ARTIFACT_SYNCED; LIVE_ACTIVATION_UNPROVEN。
  ship --restart 已禁用；先 activation-plan，再在 manifest/server 分支显式 restart-supervised。

常用旗标
  --json
  --profile web|headless
  --port 3080
  --timeout 60
  --keep                         verify-boot 成功后保留它刚启动的 Host
  --force                        init 覆盖脚手架；start/verify 不应用来抢陌生端口
  --kind function|tool|client|object|class
  --change patch|manifest|preset|client|new-client|server|artifact
  --harness <path>
  --dry-run / --print-prompt
  --task "..."

硬规则
  不在 Harness 会话里 kill/restart 宿主。
  不重复通过 bundle 和 user patch 挂同一插件。
  不把 package add、copy、dump-config、HTTP 200 当成 live/UI 证明。
  不提交 .env、.dshx、密钥、机器绝对路径。
`

export const LOOP = `外部插件开发闭环

1. 读生命周期总合同
   pnpm dshx kb cat contracts/live-activation

2. 明确改动面并只选一个分支
   pnpm dshx activation-plan <plugin> --change patch|manifest|preset|client|new-client|server|artifact

3. 写和静态检查
   pnpm dshx init <name> --kind function|tool|client|object|class
   pnpm dshx check <name>

4. 可选：隔离冷启动证明
   pnpm dshx verify-boot <name>
   它不验证现有 Host，也不会停现有 Host。

5. 可选：同步 profile 产物
   pnpm dshx sync-artifact <dir>
   到此只有 ARTIFACT_SYNCED; LIVE_ACTIVATION_UNPROVEN。

6. 执行已选分支
   patch      → kb cat playbooks/hot-config-entry
   preset     → kb cat playbooks/activate-user-preset
   client     → kb cat playbooks/update-existing-client-bundle
   new-client → kb cat playbooks/add-new-client-plugin
   server     → kb cat playbooks/restart-server-plugin
   manifest   → 下一次 Host boot 后验证

7. 分开验收
   Host tree active 不等于 client loaded。
   client loaded 不等于 visual/behavior verified。
`
