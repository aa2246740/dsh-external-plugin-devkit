# Changelog

## 0.9.5 — 2026-09-30

- Add external `plugin add <local-directory>` through the authenticated official RC2 plugin manager for Web/Desktop. No npm publication or Creator private ticket is required.
- Verify the exact local link, bundle selection, manager outcome and unchanged Host identity. Join uncertain requests without submitting duplicate installations.
- Plan RC2 bundle and new-client activation from runtime/provider evidence; keep unknown capabilities undecided and verify graph synchronization on the current page.
- Update CLI, Agent skills and knowledge guidance; retain Creator+ fixed-tool and managed-shell boundaries.
- Include local CLI/skill synchronization in release completion.


## 0.9.4 - 2026-09-30

- Fix `npx dsh-external-plugin-devkit` and the npm-installed `dshx` command failing with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. A JavaScript launcher registers the existing `tsx` dependency before loading the CLI.
- Verify `--version` and `--help` from an actual `node_modules` installation path without external loader flags. Keep the official DSH `0.2.0-rc.2` target and existing Creator+ bridge behavior.

## 0.9.2 - 2026-09-28

- Pin the desk Harness target to official `dsh-v0.2.0-rc.1` (package `@deepseek-ai/dsh@0.2.0-rc.1`, SHA `4878cdabd87d4041bdaff61d04c966883b9fd07a`). `dshx update plan --target dsh-v0.2.0-rc.1` resolves that tag. Omitting `--target` stays on it and does not follow a later alpha.
- Move `@deepseek-ai/dsh` peer to `>=0.2.0-rc.1 <0.2.1`, matching the official package version the same way `0.7.9` pinned `>=0.1.7-rc.1 <0.1.8`. The range accepts `0.2.0-rc.1` and rejects `0.2.0` alphas. `>=0.1.7-rc.1 <0.1.8` does not accept this RC.
- Keep the client-bundle inline allowlist. Official `INLINE_SAFE` at `dsh-v0.2.0-rc.1` is the same expression as `dsh-v0.1.7-rc.2`.

## 0.9.1 - 2026-09-28

- Pin the desk Harness target to official `dsh-v0.1.7-rc.2` (package `0.1.7-rc.2`, SHA `477b4f420553e8a52c2fbccc464d7561b239c443`). `dshx update plan --target dsh-v0.1.7-rc.2` resolves that tag. Omitting `--target` stays on it and does not follow a later alpha.
- Keep `@deepseek-ai/dsh` peer `>=0.1.7-rc.1 <0.1.8`. The range accepts `0.1.7-rc.2` and still rejects `0.1.7` alphas.
- Align the client-bundle inline allowlist with rc.2: `@deepseek-ai/dsh-api-workspace-controller/default-workspace` is inline-safe. The package root is not.
- The client-build spec's fabricated platform table is an ES module, matching an official checkout, so Node 22.22 can import it.

- Add Desktop Host discovery and identity checks, profile-aware plugin operations and hot reload. Keep transaction journals in the development checkout, outside the application bundle.
- Keep Desktop Host recovery owned by the desktop app; Guardian quarantines attributable failures without starting a second Host.
- Add external read-only desktop profile inspection through the public boot API; output includes row identity only, never configuration values.
- Fix Guardian profile narrowing so the complete TypeScript check passes with desktop support.
- Fix Creator shell guards reading sandbox policy and shell capabilities through undeclared Agent contexts. Resolve them through live injected service scopes and keep failing closed when dependencies disappear.
- Report `CREATOR_SANDBOX_UNAVAILABLE` for unavailable policy wiring instead of mislabeling normal plugin commands as official-source writes.
- Add native Agent + real sandbox Git commit/tag/push regression tests, including protected core writes, policy changes and dependency replacement.

- Treat official DSH source, installed packages, worktrees and artifacts as read-only. Reject core targets, symlink escapes, Host patches and compiler output outside the plugin.
- Enforce Creator filesystem/shell write guards after approval and add the rule to the runtime prompt. Keep normal plugin writes and read-only Host inspection.
- Keep `update plan`; disable source-changing Harness update stages inside and outside DSHX.

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
