# Pitfalls

社区已复现的砖。官方空白标清楚，不要把 workaround 抬成合同。

* [Orphan tool_call](orphan-tool-call.md) - 同一会话永久 400
* [Host suicide](host-suicide.md) - 会话内杀宿主
* [Retry budget exhausted](two-retry-stop.md) - RC8 默认五次；文件 id 保留兼容旧“两次后停”查询
* [Duplicate loader id](duplicate-loader-id.md) - plugin add 后 dump 查不出
* [Leftover bundles](leftover-bundles.md) - plugin remove 失败
* [dump false negative](dump-false-negative.md)
* [Creator memory](creator-memory.md) - 重启消失是合同
* [Preset collision](preset-collision.md) - 两个 tool-cordis
* [Relative patch name](relative-patch-name.md) - 相对路径解析错目录
* [file: add does not recopy](file-copy-stale.md) - Already up to date ≠ lib 已更新
* [Installed is not live](installed-is-not-live.md) - plugin add / artifact copy 不是当前 Host 激活
* [New client entry needs page reload](new-client-entry-needs-page-reload.md) - 旧页面不采纳 graph 新行
