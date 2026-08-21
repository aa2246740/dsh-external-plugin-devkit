# Directory Update Log

## 2026-08-21

* **Generation-safe Creator+ bridge (0.6.1)**: the fixed client-failure route is now one Host-scoped lease broker shared by independently loaded preset generations. The newest live generation handles requests, disposal falls back to another live generation, and the last lease unregisters the route. Managed upgrades preserve the exact `agent.cordis.yml` stamp when its bytes are unchanged, so skill or metadata updates do not create a needless generation. An already-mounted 0.6.0-or-older route needs one external Host restart during this upgrade; future generations are compatible in-process.

## 2026-08-20

* **Creator+ Guardian (0.6.0)**: bridge v2 stamps exact session/call/Host provenance, arms an external daemon at every Creator+ session start, and requires one-plugin-per-session claims. Different plugins work concurrently while only live patch mutation is serialized. The Guardian journals exact patch preimages, quarantines a high/probable culprit, gives an App launcher time to restore its own Host, avoids duplicate listeners, restarts once, opens a crash-loop fuse, and steers the durable incident back to the owning session. Control generations prevent an old recovery cycle from overwriting a newer App arm; a Guardian replacement retains the adopted App lifetime. A same-origin browser sentry reports official Loader failures through a Host-stamped fixed route; DSHX reloads only after unique attribution, quarantine, and live-manifest absence. Creator+ does not wrap Host signals, adopted Hosts cannot be manually stopped/restarted by dshx, and a DSH-managed model shell cannot invoke raw mutating/process-control DSHX commands.
* **Client crash preflight (0.5.1)**: `externalClientBundle` and `dshx check` now reject direct client `ctx.<service>` reads missing from the entry-level Cordis `export const inject`. Diagnostics distinguish that runtime declaration from package-level `dsh.client.inject`, and Creator Mode+ cannot call a manifest-present client usable before a real page load.
* **Creator Mode+ closed-loop activation (0.5.0)**: added the fixed `dshx_activate_new_client` bridge tool and `activate-new-client` CLI. The operation validates `SOURCE_BUILT`, installs the profile `link:` before touching the watched patch, safely inserts/retriggers one stable row, proves the current Host boot manifest and served client artifact, and never restarts DSH or reloads the browser. Creator instructions now stop on nonzero exit instead of improvising profile edits. A Host scarred by a pre-install negative resolution is named explicitly and handed to the external supervisor for one recovery restart; the ordered normal path was live-proved on the same PID.
* **RC8 verify-boot repair (0.5.0)**: keeps launcher-owned `--patch` before Web app flags such as `--no-open`, and skips a duplicate overlay when the target id already exists in the real profile composition.
* **RC8 compatibility (0.4.0)**: pinned contracts to official `dsh-v0.1.0-rc.8` / `141eb6f`; added the out-of-tree `externalClientBundle` contract and scaffold because the official workspace preset intentionally discovers only `packages/*/*`; updated browser boot references from `boot.tsx` to `boot.ts`; dshx Web supervision now passes `--no-open` for RC8.
* **Creator and routing correction (0.4.0)**: documented optional Codex/Claude Code Profile Bundles as a `manifest` step followed by a separate user-preset step; kept Creator Mode+ fail-closed. `--harness` is now a global explicit disambiguator, while env/config/cwd discoveries must agree when no flag is given. Setup installs `~/.local/bin/dshx` and no longer edits Harness `package.json`.
* **Retry correction (0.4.0)**: RC8 raises `resolveRetryPolicy(undefined).maxRetries` from 2 to 5; preserved the historical `two-retry-stop` knowledge id only as a backwards-compatible search target.
* **Creator Mode+ bridge (0.3.0)**: exported `dsh-external-plugin-devkit/creator-plus`, added a fail-closed Standard-to-user-preset installer, and exposed only fixed scaffold/check/activation-plan/status tools. Added the official-browser-WebUI compatibility boundary, external-supervisor ownership, and a separate `preset` lifecycle branch requiring a new session but no Host restart.

## 2026-08-19

* **Lifecycle correction (0.3.0)**: added [live-activation](/contracts/live-activation.md) pinned to official rc.7 SHA `99f6f02`; split watched config HMR, next-boot manifest/bundles, existing-client HMR, new-client page reload, server restart, and artifact-only states. Added `activation-plan`, `verify-boot`, `sync-artifact`, and `restart-supervised` semantics; removed automatic Host stops/restarts; added link:/hash/order/rollback guards and lazy-CJS client checks.
* **Update**: Track official **0.1.0-rc.7**. New contract [settings-card](/contracts/settings-card.md) + playbook: `installSettingsSection` and keyed `settings.plugin.item`. `init --kind client` scaffolds that path. Official-sources pin moved off rc.5. Creator preset `code` UI rename: Code mode → PTC mode. Session-truth notes max-token truncation no longer bricks continue. Extension-points list attachments + jobs.

## 2026-08-18

* **Update**: Onboarding for external agents. `dshx setup` / `--print-prompt` / portable `skill/dshx`, `DSHX_HARNESS` + `~/.config/dshx/harness`, `dshx ship` for stale `file:` copies, `doctor` `stale-file-copy`, `check` `client-entry`, `init --kind client`.

## 2026-08-17

* **Update**: Round 6 (4/4). `doctor` now prints ok leftover/duplicate/orphan rows when clean, and warns on unsupervised :3080 like `status`. Finding codes `port-3080` / `host-supervised` retrieve `dshx-cli`.
* **Update**: Round 5 (4/4). `external-loop` no longer puts `--keep` on `start`. verify examples use `--port 3091`. `check` without a name says how many plugins it is scanning.
* **Update**: `restart` prints the old pid before spawning. `--force` help covers start/verify, not only init. `kb search stop` ranks host restart ahead of the two-retry model pitfall.
* **Update**: `no-ui` retrieves headless-boot. `dump` hint uses the active profile. `stop` on a finished one-shot says already-exited, not signaled.
* **Update**: Multi-word aliases now retrieve even when a token is missing (`check fail` → check-plugin). Headless no longer claims :3080 in `status` / `last-host`.
* **Update**: Round-5 prep. New playbooks: [headless-boot](/playbooks/headless-boot.md), [check-plugin](/playbooks/check-plugin.md). Search treats CJK/backtick punctuation as word boundaries. Flags are command-scoped (`kb search --keep` is a query). `start` reports `already-supervising` before looking at :3080. Idle `logs` follow `last-host.json`.
* **Update**: Experiment rounds 3–4 (6 more clean-context agents). mixed-ux / host-suicide / raw-patch / port-busy / leftover-bundle / tool-boot all passed.
* **Update**: Symptom index now splits mixed timeout+400 tickets and raw `--patch` / busy :3080. `dshx start` on an unsupervised busy port tells you to `--port 3091`, not `--force`.
* **Update**: Experiment loop (6 clean-context agents). Round 1 passed retry-ux / boot-proof / session-scar. Round 2 passed dump-trap / creator-ship / logs-after-verify.
* **Update**: `kb cat <dir>` opens `<dir>/index.md`. `kb search plugin` ranks plugin-forms; `portable` hits patch-overlay. Short tokens match whole aliases, not hyphen fragments.
* **Update**: `dshx logs` reads the last launcher log after verify stops the host. `dshx logs --help` is help, not a log dump. `dshx status` warns about unsupervised :3080 and records the last workshop port.
* **Creation**: `dshx experiment begin|score` plus rubrics under `tools/dshx/experiments/`.
* **Update**: Shattered official LLM / session docs into atomic concepts after a clean-context agent missed `retry` / `timeout`.
* **Creation**: [llm-retry](/contracts/llm-retry.md), [llm-timeout](/contracts/llm-timeout.md), [llm-error](/contracts/llm-error.md), [llm-adapter](/contracts/llm-adapter.md), [plugin-config](/contracts/plugin-config.md), [turn-error](/contracts/turn-error.md).
* **Creation**: [symptoms](/maps/symptoms.md) progressive-disclosure index and [okf-practice](/maps/okf-practice.md) (Google OKF digest → shatter → index → cat).
* **Creation**: [two-retry-stop](/pitfalls/two-retry-stop.md) and [diagnose-model-ux](/playbooks/diagnose-model-ux.md).
* **Update**: `dshx kb search` ranks aliases ahead of body; results tell the agent to `kb cat`. `kb lint` runs retrieval fixtures. `kb catalog` lists frontmatter only.
* **Creation**: Initial OKF v0.2 bundle for the My-DSH external plugin workshop (`dshx`).
* **Creation**: Contracts for plugin forms, `defineTool`, events, composition, session truth, Creator Mode, dump-config, and `--patch`.
* **Creation**: Playbooks for the external loop, out-of-process restart, real boot verify, and new-session recovery.
* **Creation**: Pitfalls distilled from community-reproduced failures (orphan `tool_call`, host suicide, duplicate loader id, leftover bundles, dump false negative).
* **Creation**: Attested computations for `dshx verify`, `dshx dump`, and `dshx doctor`.
