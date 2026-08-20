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

Before any install, ship, HMR, refresh, or restart advice, read knowledge/contracts/live-activation.md and classify the changed surface:

- patch: watched config-tree reconciliation; no Host restart.
- manifest: next-boot profile/bundle composition; Host restart required.
- preset: user preset discovery; no Host restart, verify in a new/blank session.
- client: existing page entry client HMR; no Host restart or page reload.
- new-client: Host patch can reconcile live; browser page reload required.
- server: restart current supervised Host unless exact module HMR is configured and tested.
- artifact: bytes only; activation undecided.

When working through Creator Mode+, also read
`knowledge/contracts/creator-guardian.md`. As soon as the plugin id is known,
call `dshx_claim_plugin` before scaffold/edit/build/check. Different sessions may
own different plugins concurrently; the same plugin is exclusive, and only the
short live activation transaction is globally serialized.

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
- Treat Guardian recovery steering as a stop-and-repair interrupt: inspect the named incident and quarantined plugin, fix and check it, then retry the original activation branch. Never undo quarantine and repeat unchanged bytes.
- The external Guardian may recover a failed Host once. The fixed same-origin sentry may recover an official client-Loader failure only after unique attribution, quarantine, and manifest-absence proof. Neither path grants model process control or proves visual/functional behavior.
- `stop` and `restart-supervised` must refuse a Host adopted from an official launcher or App shell.
- Never mount the same plugin through both bundle and user-patch rows.
- Never call dump-config, HTTP 200, package install, or artifact copy a live activation proof.
- Never treat cordis_define / cordis_run process memory as delivery.
- Never commit .env, secrets, .dshx/, or machine-absolute paths.
- Do not patch Harness core to change an unrelated runtime policy.
