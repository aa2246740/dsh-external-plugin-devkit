# dshx — repository standing orders

This project develops file-backed DeepSeek Harness plugins outside Creator Mode. Official DSH source and published docs outrank this repository.

## Read by pointer

The OKF bundle is knowledge/. Start with:

~~~sh
pnpm dshx kb cat start-here
pnpm dshx kb cat maps/symptoms
pnpm dshx kb search <topic>
pnpm dshx kb cat <id-from-search>
~~~

A search snippet is only an id pointer. Read the matched document and its official sources before changing a contract.

Before any install, ship, HMR, refresh, or restart advice, read knowledge/contracts/live-activation.md and classify the changed surface:

- patch: watched config-tree reconciliation; no Host restart.
- manifest: next-boot profile/bundle composition; Host restart required.
- client: existing page entry client HMR; no Host restart or page reload.
- new-client: Host patch can reconcile live; browser page reload required.
- server: restart current supervised Host unless exact module HMR is configured and tested.
- artifact: bytes only; activation undecided.

## Use evidence-scoped commands

~~~sh
pnpm dshx check <name>
pnpm dshx verify-boot <name>                         # isolated cold boot only
pnpm dshx activation-plan <name> --change <branch>  # read-only lifecycle plan
pnpm dshx sync-artifact <dir>                       # ship/recopy aliases; not activation
pnpm dshx start web <name>
pnpm dshx status
pnpm dshx restart-supervised                        # current owned Web Host only
pnpm dshx stop
~~~

verify-boot must never stop an existing Host. sync-artifact must report ARTIFACT_SYNCED; LIVE_ACTIVATION_UNPROVEN. restart-supervised must refuse stale last-host state and headless task reconstruction.

Report only observed layers: source built, artifact synced, next-boot registered, Host tree active, client loaded, visual/behavior verified.

## Deliverables and forms

Scratch work belongs in my-plugins/<name>/; .dshx/ is generated state and must not be committed. A namespace function named-exports apply with optional name/inject and no default. Official object/class forms default-export their plugin and set kind: object|class. Client packages serve built lazy-CJS lib/client.js, never source TSX.

## Guardrails

- Never kill/restart DSH from inside a Harness session.
- Never mount the same plugin through both bundle and user-patch rows.
- Never call dump-config, HTTP 200, package install, or artifact copy a live activation proof.
- Never treat cordis_define / cordis_run process memory as delivery.
- Never commit .env, secrets, .dshx/, or machine-absolute paths.
- Do not patch Harness core to change an unrelated runtime policy.
