export const HELP = `dshx — 在 DeepSeek Harness 进程外开发插件的工作台

你有一份 OKF v0.2 知识库。官方长文已消化拆散，不要猜合同，也不要整篇灌 docs/：
  路径: tools/dshx/knowledge/
  入口: pnpm dshx kb
        index.md → start-here.md → maps/symptoms.md，顺着链接走
  查阅: dshx kb ls [dir]
        dshx kb catalog
        dshx kb cat <concept>
        dshx kb search <词>     命中后必须 kb cat，snippet 不是合同
                                词可以是 --keep；旗标只对当前命令生效
        dshx kb lint            含检索夹具（retry / timeout 必须能中）
        dshx kb digest

为什么不用 Creator Mode 写交付插件
  cordis_define / cordis_run 只活在进程内存，重启即无。
  Agent 在会话里 kill 宿主会把自己卡死（会话永久「运行中」）。
  dump-config 退出 0 不能证明真实 boot。
  同会话若已留下孤儿 tool_call，官方不能自愈，必须新开会话。
  模型「超时两次后停」是 dsh-llm-retry 默认预算，见 kb cat contracts/llm-retry。

推荐闭环（全部在本 CLI，不要在 DSH 里杀进程）
  0. 第一次：dshx setup --print-prompt，把那段话交给外部 Agent
  1. dshx kb / dshx kb cat maps/symptoms
  2. dshx init <name> [--kind tool|client]
  3. 用外部 Agent 改 my-plugins/<name>
  4. dshx check <name>
  5. dshx verify <name>               静态 + dump + 真实 boot（看 marker）
  6. file: 包改完用 dshx ship <dir>，不要只 add
  7. 失败就 dshx logs --grep 和 dshx doctor
  8. 改完再 dshx restart（从外面重启）
  9. 会话 400 → dshx session list，不要 Continue

命令
  help                 本说明
  setup                装脚本 / 通用 skill / 记住 Harness；--print-prompt / --dry-run
  kb                   知识库入口 / ls / catalog / cat / search / lint / path
  loop                 打印推荐开发闭环
  init <name>          在 my-plugins/ 脚手架
  check [name]         静态合同（exports、portable path、marker、client 入口）
  overlay [name]       生成绝对路径 --patch 文件（不提交）
  dump [name]          调官方 dump-config；退出 0 ≠ 能 boot
  start [web|headless] [name]   已在监督则报 already-supervising，先 stop/restart
  stop                 从外面 SIGTERM 宿主
  restart              stop + start
  status               本工具是否在监督宿主
  logs [--follow] [--grep <text>]   宿主已停也读最后一份 launcher log
  verify [name]        唯一「插件真的起来了」的命令
  ship <dir|name>      remove + add file:，强制重拷 lib（别名 recopy）
  doctor               环境 / leftover / stale file: / dump 重复 id / 会话孤儿
  session list|inspect [id]
  which                打印路径、Harness 来源、skill 安装状态
  experiment           观察者打分（begin|end|score）。写插件的 Agent 不必用

常用旗标
  --json --profile web|headless --port 3080 --timeout 60
                                默认 3080 被占且不是你的：换 --port 3091，不要 --force
  --keep          verify 成功后不关宿主
  --force         init: 覆盖已有脚手架文件。start/verify: 不要用来抢别人的端口，也不能接管自己正在监督的宿主
  --kind function|tool|client
  --harness <path>    setup 指定 checkout；多个 checkout 时必须显式选
  --dry-run / --print-prompt    setup
  --restart       ship 成功后再 restart
  --task "..."    headless 一次性任务

这不是官方 dsh doctor。官方没有 doctor 子命令。
`

export const LOOP = `外部插件开发闭环

0. 先探索知识库（拆散后的概念，不是官方长文）
   pnpm dshx kb
   pnpm dshx kb cat start-here
   pnpm dshx kb cat maps/symptoms
   pnpm dshx kb search <现象>
   pnpm dshx kb cat <命中的 id>      # 必须 cat，不要停在 search

1. 脚手架（不要在 Creator Mode 里 cordis_define）
   pnpm dshx init my-feature --kind tool

2. 用外部 Agent 按知识库改 my-plugins/my-feature
   合同优先：function 插件 named-export name / inject / apply
   工具：defineTool + inject: ['tools']
   注册必须是可逆 effect
   模型超时 / 重试：kb cat contracts/llm-retry

3. 静态检查
   pnpm dshx check my-feature

4. 真实验证（dump 只是其中一步）
   pnpm dshx verify my-feature
   成功条件：dump 里看得到 id，并且启动日志出现 marker，web 还要端口起来。

5. 需要热改时从外面重启，不要从会话里 kill
   pnpm dshx restart
   pnpm dshx logs --grep '[my-plugins/my-feature]'

6. 会话 400 / 卡 running
   pnpm dshx session list
   孤儿 tool_call → 新开会话或 headless，不要在伤疤会话上重试。
   宿主被杀 → 外面 dshx start，不要续那个 running 会话。

7. file: 包装进 profile 后改了 lib 却看不见
   pnpm dshx ship /abs/path/to/pkg
   doctor 的 stale-file-copy 为红。不要相信 add 的 Already up to date。

8. profile 被 plugin add/remove 写坏
   pnpm dshx doctor
   leftover-bundle / duplicate-id / stale-file-copy 按 pitfalls 文档手修。
`
