---
name: creator-mode-plus
description: Use for DSH WebUI plugin creation, dshx projects, client components, hot reload, activation, concurrent Creator+ sessions, Guardian recovery, refresh, restart decisions, or Creator Mode+ delivery.
---

# Creator Mode+

Build file-backed plugins against the official DeepSeek Harness WebUI. The browser page, public Cordis plugin forms, public client runtime, and public UI slots are the supported surface. App-shell APIs, native window controls, desktop bridges, and wrapper-specific refresh behavior are outside the compatibility target.

## Workflow

1. Session-start automatically arms the external Guardian. Call `dshx_status`; completion means one Harness root is named and Guardian state is visible, not that activation succeeded.
2. As soon as the plugin id is known, call `dshx_claim_plugin` before editing. Different sessions may claim different plugins concurrently; the same plugin has one owner. A nonzero conflict is a stop condition.
3. Classify the change as `patch`, `manifest`, `preset`, `client`, `new-client`, `server`, or `artifact`, then call `dshx_activation_plan`. Completion: the required new session, Host restart, and browser reload are explicit before implementation.
4. Keep source under `my-plugins/<name>/`. Use `dshx_scaffold` for a new project; edit only that project and a user-owned preset. Completion: no shipped DSH preset or Harness core file changed.
5. Add focused tests, build, then call `dshx_check`. For an RC8 client package, use the generated dshx `externalClientBundle`; the official repository `clientBundle()` does not discover `my-plugins/*`. Every service read as `ctx.<service>` belongs in the client entry's `export const inject`; `package.json` `dsh.client.inject` is package metadata and cannot satisfy Cordis. Completion: `dshx_check.exitCode` is `0`, including the `client-cordis-inject` gate, and a client package has a built lazy-CJS `lib/client.js` handoff. This proves `SOURCE_BUILT` only.
6. Present the source diff, exact activation action, impact, and rollback point. Completion: the user has approved that concrete mutation, or their current request already explicitly asks to activate/mount it.
7. Execute exactly one branch:
   - `new-client`: call `dshx_activate_new_client` with only the plugin id. Do not edit the profile manifest, run a package installer, or edit `cordis.patch.yml` yourself. Completion: `exitCode` is `0`, and stdout reports both `HOST_TREE_ACTIVE` and `CLIENT_MANIFEST_PRESENT`. The tool installs/resolves the profile link before it writes or retriggers the watched patch. It never restarts DSH and never reloads the browser.
   - `client`: rebuild the already-rostered client and observe same-page HMR; do not call the new-client tool.
   - `preset`: write only a user preset and verify it in a new/blank session.
   - `manifest` or `server`: stop at the handoff to the external supervisor; this session cannot restart its Host.
   - `patch` or `artifact`: follow the plan literally; neither result alone proves browser activation.
8. For a successful `new-client` call, tell the user to reload/reopen the official WebUI, or use an already available browser interaction capability only when authorized. Completion after reload: the new page loads the package id and its real UI/behavior works. Without that observation, stop at `CLIENT_MANIFEST_PRESENT` and describe the plugin as registered, not usable.
9. Report only observed layers: `SOURCE_BUILT`, `ARTIFACT_SYNCED`, `NEXT_BOOT_REGISTERED`, `HOST_TREE_ACTIVE`, `CLIENT_MANIFEST_PRESENT`, `CLIENT_LOADED`, `VISUAL_BEHAVIOR_VERIFIED`.

## Failure rule

If a dshx tool returns a nonzero `exitCode`, stop that branch and quote the named blocker. Do not improvise with direct profile edits, arbitrary shell commands, `pnpm install`, or a Host restart. Retry only when the blocker says the condition is retryable. If it names a cached earlier pre-install resolution failure, hand off one controlled restart to the external supervisor; Creator Mode+ never performs that restart. Matching rows are semantically retriggered only after the link is resolvable, id collisions fail closed, and a newly inserted row is rolled back when the current Host manifest cannot be proved.

If a `[Creator+ Guardian incident ...]` steering message arrives, it takes priority.
Inspect its confidence, attributed plugin, rollback, and log excerpt; repair the
preserved source and rerun `dshx_check` before retrying the original activation.
Do not undo quarantine and repeat unchanged bytes.

## Safety invariants

- The external supervisor owns process restart and rollback; this DSH session owns neither.
- The inherited bash tool is not an external supervisor. Raw mutating `dshx` commands from a DSH-managed shell are rejected; use only the fixed Creator+ tools and never unset `DSH_SHELL`/`DSH_SESSION_ID` to bypass the boundary.
- Guardian is armed for every Creator+ session and may perform one deterministic failure recovery outside DSH; a second failure inside 30 seconds opens the fuse.
- Normal launcher exit disarms Guardian. The fixed browser sentry may recover an official Loader `FAILED` entry only after DSHX uniquely attributes and quarantines it; component render exceptions, visual defects, and functional defects remain outside automatic recovery.
- `dshx_activate_new_client` is the only Creator Mode+ operation that mutates live new-client registration; its input is one validated plugin id, not a path or argv vector.
- `ARTIFACT_SYNCED` remains `LIVE_ACTIVATION_UNPROVEN` until Host and browser evidence exist.
- A client component remains click-through, supports `prefers-reduced-motion`, and does not depend on a particular App shell.
- A failed or interrupted turn and a turn waiting for user input do not count as a completed AI answer.
- RC8 optional Codex/Claude Code providers are Profile Bundles. Creator Mode+ does not install or enable them: provider installation is a `manifest` branch handled outside the session, and enabling a copied tool row is a `preset` branch verified in a new session.
