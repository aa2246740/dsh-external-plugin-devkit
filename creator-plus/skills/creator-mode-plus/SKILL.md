---
name: creator-mode-plus
description: Use for DSH WebUI plugin creation, dshx projects, client components, hot reload, activation, refresh, restart decisions, or Creator Mode+ delivery.
---

# Creator Mode+

Build file-backed plugins against the official DeepSeek Harness WebUI. The browser page, public Cordis plugin forms, public client runtime, and public UI slots are the supported surface. App-shell APIs, native window controls, desktop bridges, and wrapper-specific refresh behavior are outside the compatibility target.

## Workflow

1. Resolve the current checkout with `dshx_status`. Completion: the result names one Harness root and no write has occurred.
2. Classify the intended change as `patch`, `manifest`, `preset`, `client`, `new-client`, `server`, or `artifact`, then call `dshx_activation_plan`. Completion: the required new session, Host restart, and browser reload are explicit before implementation.
3. Keep source under `my-plugins/<name>/`. Use `dshx_scaffold` for a new project; edit only that project and a user-owned preset. Completion: no shipped DSH preset or Harness core file changed.
4. Add focused unit tests, build the package, then call `dshx_check`. For an RC8 client package, use the generated dshx `externalClientBundle`; the official repository `clientBundle()` does not discover `my-plugins/*`. Completion: tests and build pass, and a client package has a built lazy-CJS `lib/client.js` handoff.
5. Present the source diff, activation action, impact, and rollback point for approval. Completion: the user has approved the concrete mutation, not merely the feature idea.
6. Activate by the planned branch. A user preset is discovered without a Host restart and takes effect in a new session; an existing client uses HMR on the same page; a new client hot-mounts the Host row and then reloads the page; server or manifest work is handed to the external supervisor. Completion: only the branch-prescribed new session, reload, or restart occurred.
7. Verify the official WebUI in layers: `SOURCE_BUILT`, `ARTIFACT_SYNCED`, `NEXT_BOOT_REGISTERED`, `HOST_TREE_ACTIVE`, `CLIENT_LOADED`, `VISUAL_BEHAVIOR_VERIFIED`. Completion: report only layers directly observed.

## Safety invariants

- The external supervisor owns process restart and rollback; this DSH session owns neither.
- `ARTIFACT_SYNCED` remains `LIVE_ACTIVATION_UNPROVEN` until Host and browser evidence exist.
- A client component remains click-through, supports `prefers-reduced-motion`, and does not depend on a particular App shell.
- A failed or interrupted turn and a turn waiting for user input do not count as a completed AI answer.
- RC8 optional Codex/Claude Code providers are Profile Bundles. Creator Mode+ does not install or enable them: provider installation is a `manifest` branch handled outside the session, and enabling a copied tool row is a `preset` branch verified in a new session.
