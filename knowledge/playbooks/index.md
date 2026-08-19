# Playbooks

* [External loop](external-loop.md) - 标准闭环
* [Explore the knowledge base](explore-kb.md) - index → symptoms → cat；search 之后必须 cat
* [First-time setup](setup-workshop.md) - 一句话 prompt / `dshx setup`
* [Init a plugin](init-plugin.md) - 脚手架
* [Add a settings card](settings-card.md) - rc.7 官方设置卡片
* [Check a plugin](check-plugin.md) - 静态合同；default export / 绝对路径会红
* [Hot-reconcile a config entry](hot-config-entry.md) - watched patch，同 PID mount/unmount/reconfigure
* [Update an existing client bundle](update-existing-client-bundle.md) - rebuilt + 同页面行为；无需 Host restart
* [Add a new client plugin](add-new-client-plugin.md) - Host 热挂后刷新/重开页面
* [Restart a server plugin](restart-server-plugin.md) - module 变更的安全默认分支
* [Restart from outside](restart-outside.md) - 仅重启当前 supervised Host；禁止会话内杀宿主
* [Verify an isolated cold boot](verify-boot.md) - dump + marker + HTTP；不是 live activation
* [Headless boot](headless-boot.md) - `--task` 一次性宿主，不是新会话急救
* [New session after error](new-session.md) - 400 / running
* [Diagnose model UX](diagnose-model-ux.md) - 超时 / 两次重试后停
* [Persist files, not memory](persist-files.md) - 交付物是磁盘
* [Synchronize an artifact](ship-plugin.md) - link: / legacy file:；不证明 live activation
