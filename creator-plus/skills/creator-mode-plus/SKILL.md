---
name: creator-mode-plus
description: Use for DSH WebUI plugin creation, deletion or safe removal, DSHX v0.7 projects, client components, activation, hot reload, Harness update requests, concurrent Creator+ sessions, Guardian recovery, refresh or restart decisions, and Creator Mode+ delivery.
---

# Creator Mode+

Build file-backed plugins against the official DeepSeek Harness browser WebUI through the complete stable DSHX v0.7 contract. The browser page, public Cordis plugin forms, public client runtime, and public UI slots are the supported surface. App-shell APIs, native window controls, desktop bridges, and wrapper-specific refresh behavior are outside the compatibility target. Creator Bridge v2 exposes seven fixed model tools, including source-preserving safe removal; the Harness Update Assistant stays externally supervised.

## Workflow

1. Session-start automatically arms the external Guardian. Call `dshx_status`; completion means exit code `0`, one Harness checkout, stable DSHX `>=0.7.4 <0.8.0`, contract `dshx-v0.7/creator-bridge-v2`, and bridge version `2`. Status must include one attached/supervised same-Home Web Host, no shared-Home collision or unknown Host, safe plugin removal, and proactive plugin-integrity quarantine. Status is inventory, not activation proof.
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
   - `manifest` or `server`: stop at the handoff to the external supervisor; this session cannot restart its Host.
   - `patch` or `artifact`: follow the plan literally; neither result alone proves browser activation.
9. After successful `new-client`, browser testing remains a task-time Agent or user-prompt decision; Creator Mode+ does not require a particular browser tool. Claim `CLIENT_LOADED` or `VISUAL_BEHAVIOR_VERIFIED` only after direct browser observation or an explicit live user report. A user report that the requested behavior works ends speculative diagnosis and further mutation.
10. Report only observed layers: `SOURCE_BUILT`, `ARTIFACT_SYNCED`, `NEXT_BOOT_REGISTERED`, `HOST_TREE_ACTIVE`, `CLIENT_MANIFEST_PRESENT`, `CLIENT_LOADED`, `VISUAL_BEHAVIOR_VERIFIED`.

## Safe removal

For a request to remove, uninstall, or delete a whole plugin, call `dshx_remove_plugin` with only its claimed id. Never use bash, `rm`, `unlink`, `mv`, manual profile edits, or package-manager commands for whole-plugin teardown. Completion requires exit code `0`, `HOST_TREE_INACTIVE`, and `PROFILE_DEPENDENCY_REMOVED`; claim `SOURCE_PRESERVED` only when the source still exists. The fixed tool removes the live watched row first, proves same-PID absence, runs the official profile remover while its dependency exists, and detaches only verified plugin-owned symlinks. If RC8 leaves a `node_modules` symlink after removing the dependency, `detached-orphan-symlink` proves the entry was a symlink targeting this claim's Harness/source path; any directory or outside target fails closed. A partial attempt resumes from durable quarantine and does not rerun package removal for an already-absent dependency. Source stays preserved and no Host restart occurs.

That fixed tool is the watched-row path. If it reports boot-captured bundle evidence or no bounded watched row, hand removal to the external `dshx plugin remove <package> --profile web --port <current-port>` supervisor command. It writes a temporary live disable, proves same-PID absence, then invokes the official remover. The disable remains while the old boot is alive and is cleaned by rerunning the same command only after a later normal App boot is proved to have started from the clean profile. Creator Mode+ never runs this external command itself.

Ordinary file/component cleanup inside a claimed plugin remains normal editing. If plugin-root/profile teardown is denied, do not retry through another shell or script. If Guardian reports `plugin-integrity-failed`, it already quarantined the stale watched row before cold boot; inspect the incident and preserved source.

## Harness update requests

DSHX v0.7 adds `update plan → prepare → verify → apply` plus exact `rollback`, but these do not become Creator bridge tools.

1. Call `dshx_status` and fail closed unless it reports the exact v0.7 contract and one Harness checkout.
2. Read `contracts/harness-update`. The inherited managed shell may run only read-only `dshx update plan` against that resolved checkout; mutating update stages remain rejected.
3. Report plan output as inventory only: target tag/SHA, current branch/SHA, dirty state, and plugin matrix. It does not prove the target builds or any plugin works.
4. Hand `update prepare`, `update verify`, `update apply`, and `update rollback` to the external DSHX supervisor. Never unset `DSH_SHELL`, spawn a replacement Host, or turn a fixed tool into a generic update runner.
5. Keep `candidate prepared`, `candidate verified`, `applied locally`, `real runtime accepted`, and `production activated` as separate states.

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
