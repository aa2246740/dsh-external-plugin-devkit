# dshx — repository standing orders

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
- manifest: boot-captured `dsh.profile.bundles` / package `dsh.bundle` composition; Host restart requires that exact evidence.
- preset: user preset discovery; no Host restart, verify in a new/blank session.
- client: existing page entry client HMR; no Host restart or page reload.
- new-client: Host patch can reconcile live; browser page reload required.
- server: restart current supervised Host unless exact module HMR is configured and tested.
- artifact: bytes or dependency-only work; no restart for this step, activation remains separate.

When working through Creator Mode+, also read
`knowledge/contracts/creator-guardian.md`. As soon as the plugin id is known,
call `dshx_claim_plugin` before scaffold/edit/build/check. Different sessions may
own different plugins concurrently; the same plugin is exclusive, and only the
short live activation transaction is globally serialized.
Creator scaffold destinations must come from the immutable session cwd. DSHX,
not the model or user, owns any required link into Harness `my-plugins`.
Every release must execute the exact argv behind all six fixed Creator+ tools and
the internal watch/release/recovery hooks through the bridge allowlist. Tool
registration alone does not prove the bridge is callable.
Keep `DSHX_VERSION` equal to `package.json`. `ensureGuardian` may replace a
fresh, live older Guardian through one bounded handoff; stale or unverifiable
PID state must fail closed without sending a signal.

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

Report only observed layers: source built, artifact synced, next-boot registered, Host tree active, client loaded, visual/behavior verified.

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
- Do not patch Harness core to change an unrelated runtime policy.
