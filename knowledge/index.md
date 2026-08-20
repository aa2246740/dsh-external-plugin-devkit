---
okf_version: "0.2"
---

# DeepSeek Harness 外部插件知识库

这是一份 **OKF v0.2** bundle。给外部 Agent 和人一起用。

**先读这份 index，再打开 [start-here](start-here.md)。遇到具体现象先打开 [symptoms](maps/symptoms.md)。不要凭记忆写插件，也不要把官方长文整篇读完再猜。**

官方运行时合同仍在本仓库源码与 `docs/` 里。本 bundle 把长文 **消化后拆散** 成可遍历的图；每篇 `resource` / `sources` 指回权威文件。Skill 和过时 README **不是**合同。

组织方法见 [How this bundle follows Google OKF](maps/okf-practice.md)。

# 从这里开始

* [Start here](start-here.md) - 外部 Agent 第一篇：有这份 bundle、怎么查、什么不能做
* [Symptom index](maps/symptoms.md) - 超时 / 400 / dump 假阴性等现象 → 该 cat 哪篇
* [OKF practice](maps/okf-practice.md) - 为什么拆散、index 怎么走、search 之后必须 cat
* [Why external](why-external.md) - Creator Mode 为什么写不好可交付插件
* [Creator Mode+ safe bridge](contracts/creator-mode-plus.md) - dshx 作为受限 preset 插件时的 WebUI 与 supervisor 边界
* [Live activation matrix](contracts/live-activation.md) - 先区分 patch / manifest / preset / client / new-client / server / artifact
* [Recommended loop](playbooks/external-loop.md) - `dshx` 闭环

# 合同（先于教程）

* [Contracts](contracts/) - live activation、插件形态、设置卡片、工具、事件、合成、Session、Creator、LLM retry/timeout、dump/patch
* [Authority tiers](contracts/authority.md) - 源码 / 文档站 / skill / 社区谁说了算

# 工作流

* [Playbooks](playbooks/) - setup、初始化、静态 check、artifact sync、配置热重组、client HMR/刷新、受控重启、冷 boot

# 坑

* [Pitfalls](pitfalls/) - installed ≠ live、新 client 需刷新、孤儿 tool_call、宿主自杀、dump 假阴性、file: 不重拷

# 地图

* [Maps](maps/) - 现象索引、官方文件清单、扩展点、packages、文档站路由

# 社区（不是合同）

* [Community tools](community/) - boot-guard / sanitizer / 民间 doctor，分级标注

# 可核验计算

* [Attested computations](computations/) - `dshx verify-boot` / `dump` / `doctor` / 检索夹具

# 参考

* [References](references/) - OKF 自身、本工具说明
* [Update log](log.md) - 本 bundle 变更
