---
name: creator-mode-plus
description: Use for DSH WebUI plugin creation, deletion or safe removal, DSHX v0.7 projects, client components, activation, hot reload, Harness update requests, concurrent Creator+ sessions, Guardian recovery, refresh or restart decisions, and Creator Mode+ delivery.
---

# Creator Mode+

## 不可跨越：只开发插件，不改 DSH 源码

DSHX 与 Creator Mode+ 只用于独立外部插件。官方 Harness 源码、内置插件、内置预设、官方包及其构建产物均为只读；本机工作树、临时副本、Git worktree、node_modules 链接和安装目录遵守同一规则。

禁止为插件补 Host 接口、改核心实现、替换官方文件、应用 Host 源码补丁，或让插件构建重新编译官方子项目。需要“先改 Host 才能完成”的方案不成立：先找公开扩展点，在插件内实现；接口确实缺失时报告具体能力缺口，并完成其余插件工作。不要把核心修改包装成兼容修复、临时验收或交付前提。

插件开发授权、用户确认接管、自动审批、交接包中的“必要时补 Host”、`--force` 都不能解除此规则。外部监督者同样受约束。不要为此请求一次性豁免。用户自己的 profile 的 watched `cordis.patch.yml` 是配置扩展，与修改官方源码的 `.patch` 完全不同；插件包、插件自己的构建目录、用户预设和正式插件安装配置仍可按已授权流程操作。

看到 `CORE_SOURCE_IMMUTABLE` 就调整插件方案；不得换 shell、脚本、路径、复制目录或其他 Agent 绕过。只能读取官方实现和公开 API，所有插件构建输出都留在插件目录。


Build file-backed plugins against the official DeepSeek Harness browser WebUI through the complete stable DSHX v0.7 contract. The browser page, public Cordis plugin forms, public client runtime, and public UI slots are the supported surface. App-shell APIs, native window controls, desktop bridges, and wrapper-specific refresh behavior are outside the compatibility target. Creator Bridge v2 exposes seven fixed model tools, including source-preserving safe removal; Harness version inventory is read-only.

## Authenticated Host proof

Creator+ obtains current-Host authentication through the official Connection service and keeps credentials inside the bridge. `WEB_AUTH_REQUIRED` is a bridge/launcher authentication blocker, not proof that the plugin is broken. Preserve source and the claim, report the exact blocker, and retry the fixed tool after the bridge is repaired. Keep Host authentication enabled; never ask for a token in chat or scan credential stores/logs. External DSHX launchers can pass `DSHX_WEB_STARTUP_URL` privately for the selected loopback Host. RC2 client HMR can load a new client on the current page. Observe that page and a real user workflow before claiming delivery; reload only if its graph transport is unavailable.

## Workflow

1. Session-start automatically arms the external Guardian. Call `dshx_status`; completion means exit code `0`, one Harness checkout, stable DSHX `>=0.7.5 <0.8.0`, contract `dshx-v0.7/creator-bridge-v2`, and bridge version `2`. Status must include one identity-bound attached/supervised same-Home Web Host, no shared-Home collision or unknown Host, safe plugin removal, and proactive plugin-integrity quarantine. Status is inventory, not activation proof.
2. As soon as the plugin id is known, call `dshx_claim_plugin` before editing. Different sessions may claim different plugins concurrently; the same plugin has one owner. A nonzero conflict is a stop condition.
3. For a new project, call `dshx_scaffold` immediately after the claim. It creates source under the calling session's trusted writable workspace and, when needed, creates the Harness `my-plugins/<name>` link itself. Use the returned source path for all edits; never create a substitute project or ask the user to add a symlink. Existing projects skip this step.
4. Classify the change as `patch`, `manifest`, `preset`, `client`, `new-client`, `server`, or `artifact`. A new browser UI plugin is normally `new-client`. Before broad repository exploration, use the read-only DSHX knowledge bundle for the selected seam. A client starts with `dshx kb cat contracts/client-build` and `dshx kb cat maps/extension-points`; an update request starts with `dshx kb cat contracts/harness-update`. Follow an official source pointer only when the contract lacks the needed detail.
5. Edit only the scaffolded/claimed project and a user-owned preset. Add focused tests, build, then call `dshx_check`. For an RC8/RC2 client package, keep the generated dshx `externalClientBundle`; it owns lazy-CJS, shared modules, CSS and HMR. Every service read as `ctx.<service>` belongs in the client entry's `export const inject`; `package.json` `dsh.client.inject` is package metadata and cannot satisfy Cordis. Completion: `dshx_check.exitCode` is `0`, including the `client-cordis-inject` gate, and a client package has a built lazy-CJS `lib/client.js` handoff. This proves `SOURCE_BUILT` only. A fresh `new-client` must reach this point before activation planning because the plan validates that built handoff.
6. Call `dshx_activation_plan` for the classified branch. For a fresh `new-client`, call it only after `dshx_check` exits `0`; for an existing build-ready target it may run before editing. Do not begin live mutation until the selected plan returns exit code `0`. Completion: the required new session, Host restart, and browser reload are explicit.
7. Present the source diff, exact activation action, impact, and rollback point. Completion: the user has approved that concrete mutation, or their current request already explicitly asks to activate/mount it.
8. Execute exactly one branch:
   - `new-client`: call `dshx_activate_new_client` with only the plugin id. Do not edit the profile manifest, run a package installer, or edit `cordis.patch.yml` yourself. Completion: `exitCode` is `0`, and stdout reports both `HOST_TREE_ACTIVE` and `CLIENT_MANIFEST_PRESENT`. The tool installs/resolves the profile link before it writes or retriggers the watched patch. It never restarts DSH and never reloads the browser.
   - `client`: rebuild the already-rostered client and observe same-page HMR; do not call the new-client tool.
   - `preset`: write only a user preset and verify it in a new/blank session.
   - `server`: `hostRestart: not-decided` means missing activation evidence, not restart-required. Preserve the claim and checked source, and hand exact target/scope evidence to the external supervisor for bounded official module HMR. Root Loader replacement does not prove preset-private bridge replacement. Do not invoke raw mutating CLI commands from this session.
   - `manifest`: verify RC2 profile HMR and the official manager outcome before handing the bundle operation to the external supervisor. Launcher identity alone never authorizes a restart; this session cannot restart its Host.
   - `patch` or `artifact`: follow the plan literally; neither result alone proves browser activation.
9. After successful `new-client`, browser testing remains a task-time Agent or user-prompt decision; Creator Mode+ does not require a particular browser tool. Claim `CLIENT_LOADED` or `VISUAL_BEHAVIOR_VERIFIED` only after direct browser observation or an explicit live user report. A user report that the requested behavior works ends speculative diagnosis and further mutation.
10. Report only observed layers: `SOURCE_BUILT`, `ARTIFACT_SYNCED`, `NEXT_BOOT_REGISTERED`, `HOST_TREE_ACTIVE`, `CLIENT_MANIFEST_PRESENT`, `CLIENT_LOADED`, `VISUAL_BEHAVIOR_VERIFIED`.

## Safe removal

For a request to remove, uninstall, or delete a whole plugin, call `dshx_remove_plugin` with only its claimed id. Never use bash, `rm`, `unlink`, `mv`, manual profile edits, or package-manager commands for whole-plugin teardown. Completion requires exit code `0`, `HOST_TREE_INACTIVE`, and `PROFILE_DEPENDENCY_REMOVED`; claim `SOURCE_PRESERVED` only when the source still exists. The fixed tool removes the live watched row first, proves same-PID absence, runs the official profile remover while its dependency exists, and detaches only verified plugin-owned symlinks. If RC8 leaves a `node_modules` symlink after removing the dependency, `detached-orphan-symlink` proves the entry was a symlink targeting this claim's Harness/source path; any directory or outside target fails closed. A partial attempt resumes from durable quarantine and does not rerun package removal for an already-absent dependency. Source stays preserved and no Host restart occurs.

That fixed tool is the watched-row path. If it reports boot-captured bundle evidence or no bounded watched row, hand removal to the external `dshx plugin remove <package> --profile web --port <current-port>` supervisor command. It writes a temporary live disable, proves same-PID absence, then invokes the official remover. The disable remains while the old boot is alive and is cleaned by rerunning the same command only after a later normal App boot is proved to have started from the clean profile. Creator Mode+ never runs this external command itself.

Ordinary file/component cleanup inside a claimed plugin remains normal editing. If plugin-root/profile teardown is denied, do not retry through another shell or script. If Guardian reports `plugin-integrity-failed`, it already quarantined the stale watched row before cold boot; inspect the incident and preserved source.

## Harness update requests

Only `dshx update plan` remains available. Read `contracts/plugin-only` and `contracts/harness-update`. Report versions, dirty state and plugin inventory as read-only evidence. `prepare`, `verify`, `apply` and `rollback` are disabled for every DSHX caller, including the external supervisor. Do not construct a replacement updater or patch a copied Host. Keep any missing public API as an explicit plugin capability gap.

## Failure rule

If a dshx tool returns a nonzero `exitCode`, stop that branch and quote the named blocker. Do not improvise with direct profile edits, arbitrary shell commands, `pnpm install`, or a Host restart. Retry only when the blocker says the condition is retryable. If it names a cached earlier pre-install resolution failure, hand off one controlled restart to the external supervisor; Creator Mode+ never performs that restart. Matching rows are semantically retriggered only after the link is resolvable, id collisions fail closed, and a newly inserted row is rolled back when the current Host manifest cannot be proved.

If a fixed tool throws `refusing an operation outside bridge v2` before returning a structured result, report a Creator Bridge integrity defect with the exact tool and error, then stop. Preserve the claimed plugin and its source location. Do not reinterpret this error as a supervisor or permission decision, continue through a raw shell, create the project elsewhere, edit profile files manually, or claim that a later lifecycle step succeeded. Resume only after the bridge is upgraded and the same fixed tool succeeds.

If a `[Creator+ Guardian incident ...]` steering message arrives, it takes priority.
Inspect its confidence, attributed plugin, rollback, and log excerpt; repair the
preserved source and rerun `dshx_check` before retrying the original activation.
Do not undo quarantine and repeat unchanged bytes.

## Safety invariants

- The external supervisor owns process restart and rollback; this DSH session owns neither.
- DSH.app, direct `dsh web`, and dshx are launchers for one long-lived Web Host
  per `DSH_HOME`. Creator Mode+ never starts a second port; collision or denied
  Host/Home visibility is a stop condition. Cold-boot proof uses dshx's temporary
  Home and cannot be kept alive.
- The inherited bash tool is not an external supervisor. Raw mutating `dshx` commands from a DSH-managed shell are rejected; read-only `update plan` is the sole Harness-update exception. Use only the seven fixed tools for plugin mutation and never unset `DSH_SHELL`/`DSH_SESSION_ID` to bypass the boundary.
- Guardian is armed for every Creator+ session and may perform one deterministic failure recovery outside DSH; a second failure inside 30 seconds opens the fuse.
- Normal launcher exit disarms Guardian. The fixed browser sentry may recover an official Loader `FAILED` entry only after DSHX uniquely attributes and quarantines it; component render exceptions, visual defects, and functional defects remain outside automatic recovery.
- While the Host remains healthy, Guardian quarantines a claimed watched client whose profile link or source package disappears, preventing a stale cold boot without deleting source or restarting the Host.
- `dshx_activate_new_client` is the only Creator Mode+ operation that mutates live new-client registration; its input is one validated plugin id, not a path or argv vector.
- `dshx_remove_plugin` is the only whole-plugin teardown operation; it preserves source and accepts one validated plugin id, never a path or deletion command.
- `ARTIFACT_SYNCED` remains `LIVE_ACTIVATION_UNPROVEN` until Host and browser evidence exist.
- A client component remains click-through, supports `prefers-reduced-motion`, and does not depend on a particular App shell.
- A failed or interrupted turn and a turn waiting for user input do not count as a completed AI answer.
- RC8/RC2 optional Codex/Claude Code providers are Profile Bundles. Creator Mode+ does not install or enable them: provider installation is a `manifest` branch handled outside the session, and enabling a copied tool row is a `preset` branch verified in a new session.

## 认领冲突直接申请接管

如果 `dshx_claim_plugin` 或自动认领提示已有持有者，在当前对话调用 `dshx_request_takeover({name})`，让用户在原生选项卡里确认。工具自己查找实际持有者并负责停止、等待和转移。不要让用户先找旧对话，不要建议等 24 小时，不要手删认领或 session.lock。

只能传插件 ID。不要传 `force`、`userApproved`、会话 ID、路径或令牌，也不要把聊天里的同意或自动审批结果冒充 UI 确认。取消、认领变化、停止失败时依照工具错误处理；成功后继续 check → 对应激活 → 行为验证。旧会话收到 `CREATOR_OWNERSHIP_REVOKED` 时停止开发；重新接手也要走同一个确认入口。
