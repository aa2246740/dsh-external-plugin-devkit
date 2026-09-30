# dshx — repository standing orders

## 不可跨越：只开发插件，不改 DSH 源码

DSHX 与 Creator Mode+ 只用于独立外部插件。官方 Harness 源码、内置插件、内置预设、官方包及其构建产物均为只读；本机工作树、临时副本、Git worktree、node_modules 链接和安装目录遵守同一规则。

禁止为插件补 Host 接口、改核心实现、替换官方文件、应用 Host 源码补丁，或让插件构建重新编译官方子项目。需要“先改 Host 才能完成”的方案不成立：先找公开扩展点，在插件内实现；接口确实缺失时报告具体能力缺口，并完成其余插件工作。不要把核心修改包装成兼容修复、临时验收或交付前提。

插件开发授权、用户确认接管、自动审批、交接包中的“必要时补 Host”、`--force` 都不能解除此规则。外部监督者同样受约束。不要为此请求一次性豁免。用户自己的 profile 的 watched `cordis.patch.yml` 是配置扩展，与修改官方源码的 `.patch` 完全不同；插件包、插件自己的构建目录、用户预设和正式插件安装配置仍可按已授权流程操作。

看到 `CORE_SOURCE_IMMUTABLE` 就调整插件方案；不得换 shell、脚本、路径、复制目录或其他 Agent 绕过。只能读取官方实现和公开 API，所有插件构建输出都留在插件目录。


This project develops file-backed DeepSeek Harness plugins outside Creator Mode. Official DSH source and published docs outrank this repository.

## Read by pointer

The OKF bundle is knowledge/. Start with:

~~~sh
dshx kb cat start-here
dshx kb cat maps/symptoms
dshx kb search <topic>
dshx kb cat <id-from-search>
~~~

A search snippet is only an id pointer. Read the matched document and its official sources before changing a contract.

Before any install, ship, HMR, refresh, or restart advice, use a same-PID default, read knowledge/contracts/live-activation.md, and classify the changed runtime surface. A plain dependency write is a resolution prerequisite, not manifest activation or restart evidence:

- patch: watched config-tree reconciliation; no Host restart.
- manifest: RC2 profile HMR reconciles bundle selection on the same Host. Verify the actual runtime/provider and official manager outcome; unknown capability does not authorize restart.
- preset: user preset discovery; no Host restart, verify in a new/blank session.
- client: existing page entry client HMR; no Host restart or page reload.
- new-client: Host patch and RC2 client graph can reconcile live. Observe the current page; reload only when its graph transport is unavailable.
- server: missing module-HMR evidence means activation is undecided, not restart-required. Prefer the bounded hot-reload transaction and prove same-PID replacement; its failure does not authorize a restart.
- artifact: bytes or dependency-only work; no restart for this step, activation remains separate.

When working through Creator Mode+, also read
`knowledge/contracts/creator-guardian.md`. As soon as the plugin id is known,
call `dshx_claim_plugin` before scaffold/edit/build/check. Different sessions may
own different plugins concurrently; the same plugin is exclusive, and only the
short live activation transaction is globally serialized.
Creator scaffold destinations must come from the immutable session cwd. DSHX,
not the model or user, owns any required link into Harness `my-plugins`.
Every release must execute the exact argv behind all nine fixed Creator+ tools and
the internal watch/release/recovery hooks through the bridge allowlist. Tool
registration alone does not prove the bridge is callable.
The eighth tool, `dshx_hot_reload`, accepts only a claimed plugin id and uses Host-derived identity for bounded official module HMR. It grants no process control and requires runtime replacement and cleanup proof before reporting module activation.
The seventh tool, `dshx_remove_plugin`, must quarantine/remove the live watched
row, prove same-Host absence, use the official profile remover when the
dependency still exists, and detach only verified plugin-owned symlinks. A
partial removal must resume from its durable quarantine without rerunning a
package-manager removal for an already-absent dependency. Preserve source and
never control the Host process.
The destructive-shell guard covers claimed plugin-root, Harness-link and active-profile teardown. The independent core-source guard also protects official source and artifacts; ordinary plugin component cleanup remains allowed.
Guardian independently detects a claimed watched client whose profile link has
disappeared and quarantines the row while the Host is healthy, before a cold boot
can consume stale configuration.
Keep `DSHX_VERSION` equal to `package.json`. `ensureGuardian` may replace a
fresh, live older Guardian through one bounded handoff; stale or unverifiable
PID state must fail closed without sending a signal.

## Release and local installation completion

An authorized formal release includes matching GitHub main/tag/Release and npm
publication. Verify the public version, dist-tag, downloaded artifact and actual
CLI or plugin installation before reporting completion.

On the development machine, also inventory the active CLI, selected Harness,
already-installed Agent skill links, and Creator Mode+ runtime resolution.
Synchronize the intended local installations with the released checkout. Run
`dshx which` and resolve every stale installed skill target; a missing optional
integration is different from an installed integration pointing at an older
release. Verify the launcher bytes/version and Creator Mode+ bridge compatibility.
Preserve unrelated Agent configuration, source work and running Hosts. Existing
Agent conversations must re-read the updated skill to replace cached guidance.
GitHub/npm success alone is not evidence that this local synchronization happened.

## Use evidence-scoped commands

~~~sh
dshx check <name>
dshx verify-boot <name>                         # isolated cold boot only
dshx activation-plan <name> --change <branch>  # read-only lifecycle plan
dshx sync-artifact <dir>                       # ship/recopy aliases; not activation
dshx start web <name>
dshx status
dshx restart-supervised                        # current owned Web Host only
dshx stop
~~~

verify-boot must never stop an existing Host. sync-artifact must report ARTIFACT_SYNCED; LIVE_ACTIVATION_UNPROVEN. restart-supervised must refuse stale last-host state and headless task reconstruction.

Retain observed lifecycle layers as internal evidence. User-facing updates state whether the plugin is complete, which features were verified, and any remaining work. Explain process diagnostics only when the user asks or needs them to act.

## Deliverables and forms

Scratch work belongs in my-plugins/<name>/; .dshx/ is generated state and must not be committed. A namespace function named-exports apply with optional name/inject and no default. Official object/class forms default-export their plugin and set kind: object|class. Client packages serve built lazy-CJS lib/client.js, never source TSX.

## Guardrails

- Never kill/restart DSH from inside a Harness session.
- Treat `refusing an operation outside bridge v2` from a fixed tool as a bridge integrity defect. Preserve the plugin and stop at that tool; never reinterpret it as policy denial, manually mount the plugin, or report downstream success.
- Treat Guardian recovery steering as a stop-and-repair interrupt: inspect the named incident and quarantined plugin, fix and check it, then retry the original activation branch. Never undo quarantine and repeat unchanged bytes.
- The external Guardian may recover a failed Host once. The fixed same-origin sentry may recover an official client-Loader failure only after unique attribution, quarantine, and manifest-absence proof. Neither path grants model process control or proves visual/functional behavior.
- `stop` and `restart-supervised` must refuse a Host adopted from an official launcher or App shell.
- Never mount the same plugin through both bundle and user-patch rows.
- Treat preset generations as concurrent. A process-global exact route or resource mounted by a preset must be shared through a Host-scoped cross-generation lease, or live in the Host composition instead of the session generation.
- A managed preset upgrade whose `agent.cordis.yml` bytes are unchanged must preserve that file's exact filesystem stamp. Metadata-only work must not manufacture another preset generation.
- Never call dump-config, HTTP 200, package install, or artifact copy a live activation proof.
- Never treat cordis_define / cordis_run process memory as delivery.
- Never commit .env, secrets, .dshx/, or machine-absolute paths.
- Never patch Harness core for any plugin feature, compatibility repair, test, recovery or delivery. Read contracts/plugin-only before changing plugin boundaries.

## User-confirmed takeover

`dshx_request_takeover({name})` is the only model-facing handoff entry. It uses
the public `userQuestions` service; an approval/request auto-allow or model
boolean is not confirmation. A Host-lifetime, durable ownership fence blocks
all tools in revoked old sessions except status and a new takeover request;
this is separate from the narrow destructive-shell guard. It persists across
preset generations, and never deletes session locks or restarts the Host.
