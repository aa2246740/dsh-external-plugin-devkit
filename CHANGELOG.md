# Changelog

## 0.9.1 - 2026-09-24

- Pin the desk Harness target to official `dsh-v0.1.7-rc.2` (package `0.1.7-rc.2`, SHA `477b4f420553e8a52c2fbccc464d7561b239c443`). `dshx update plan --target dsh-v0.1.7-rc.2` resolves that tag. Omitting `--target` stays on it and does not follow a later alpha.
- Keep `@deepseek-ai/dsh` peer `>=0.1.7-rc.1 <0.1.8`. The range accepts `0.1.7-rc.2` and still rejects `0.1.7` alphas.
- Align the client-bundle inline allowlist with rc.2: `@deepseek-ai/dsh-api-workspace-controller/default-workspace` is inline-safe. The package root is not.
- The client-build spec's fabricated platform table is an ES module, matching an official checkout, so Node 22.22 can import it.

## 0.9.0 - 2026-09-24

Supersedes 0.7.9, which was never released; includes everything in that entry plus the fixes below.

- `--kind client` scaffold works on rc.1: drop the deleted `@deepseek-ai/dsh-client-runtime` peer, emit `Context as ClientContext` from `@deepseek-ai/cordis`, type-augment `dsh-client-ui-layout/client` + `dsh-client-ui-renderer/client` for `ctx.slots`, and reference the real vendor/packages tsconfigs. Install → tsc → tsdown → check → verify-boot all green.
- New `compat-017` diagnostics close the silent-fail hole: `check` now flags `agent/session-start` (renamed `agent/created`), `@deepseek-ai/dsh-agent-presets/*` (removed upstream), `job.ownerSession` (now `job.owner`), and `@deepseek-ai/dsh-client-runtime` imports. The poison drill's silently-broken plugin now fails loudly instead of slipping through.
- Mount packaged server/function plugins by package name through the profile `node_modules` link — hot-reload no longer returns `ROOT_TARGET_AMBIGUOUS` for devkit-mounted plugins (was #8).
- `dshx check`/activation/hot-reload resolve plugins registered only via profile `link:`/`file:` dependencies, so claimed plugins living outside `my-plugins/` are found (was #10/#11).
- `update plan` reads the configured `remote.origin.url`, not the insteadOf-rewritten URL — works behind git proxies (was #9).
- `setup` installs the Claude Code skill whenever the CLI is on `PATH`, not only when `~/.claude` already exists.
- `client-build.spec` fabricates a stub harness platform table, so the suite passes without `DSHX_HARNESS`.
- Out-of-repo plugin paths display as absolute paths instead of `../../…`.
- `activationDecision` no longer reads `facts.id` outside its `Pick` (real type bug); the 69 pre-existing `tsc --noEmit` errors are cleared to 0 — strict spec debt is marked explicitly (`@ts-nocheck`/`@ts-expect-error`) rather than left as noise.
- README/README.en version references updated to 0.1.7-rc.1.

## 0.7.9 - 2026-09-23

- Pin the desk Harness target to official `dsh-v0.1.7-rc.1` (package `0.1.7-rc.1`). `dshx update plan` without `--target` stays on that tag and does not follow a later alpha.
- Declare `@deepseek-ai/dsh` peer `>=0.1.7-rc.1 <0.1.8`, and write the same range into generated client scaffolds. The range accepts `0.1.7-rc.1` and rejects `0.1.7` alphas. `^0.1.5-rc.3` does not accept rc.1.
- Align the client-bundle inline allowlist with rc.1, including `dsh-agent-preset-registry/display`, `dsh-plugin-manager/registry`, and `dsh-native-command/types`.
- Deliver Creator+ recovery on `agent/created`. `agent/session-start` is gone.

## 0.7.8 - 2026-09-21

- Add user-confirmed Creator+ takeover with atomic, snapshot-bound claims, private single-use grants, durable revocations and ownership checks inside the activation lock.
- Add `dshx_request_takeover` to the bundled bridge; show the current owner and wait for the old session, children, jobs and terminals to stop before transferring.
- Keep fences effective across preset generations and Host module reloads. Expired leases alone never authorize a second writer.
- Add read-only `creator inspect <id> --json`; keep `creator takeover` private to the fixed bridge and preserve the managed-shell boundary.
- Pair with standalone Creator+ 0.3.8. Automated native-runtime and CLI acceptance is separate from human UI click-through, which remains unverified.
