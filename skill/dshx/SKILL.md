---
name: dshx
description: >-
  Use the unofficial dshx CLI and its OKF bundle for DeepSeek Harness external
  plugin work. Trigger when the user says dshx, /dshx, dsh-external-plugin-devkit,
  my-plugins, Creator Mode delivery, plugin add/ship/check/verify, HMR, hot reload,
  热重载, 热插拔, 不重启, or asks whether a DSH plugin needs a browser reload or
  Host restart. Before any ship/restart advice, classify the changed surface with
  contracts/live-activation. Not official dsh.
---

# dshx

Use `dshx` for profile-scoped, file-backed plugins developed by an external agent or through the optional Creator Mode+ safe bridge. The CLI outside DSH is always the supervisor; Creator Mode+ exposes fixed scaffold/check/plan/status tools but never process control. Do not transfer the original Creator Mode's in-memory lifecycle assumptions to external packages.

## Resolve the checkout

The CLI requires one DeepSeek Harness checkout containing both `apps/cli/src/bin.ts` and `tools/dshx/src/cli.ts`.

Resolve in this order:

1. `$DSHX_HARNESS`.
2. Walk upward from cwd.
3. `~/.config/dshx/harness` written by `dshx setup`.

If more than one checkout resolves, stop and ask which one. Never guess or hardcode another machine's path.

Invoke through this skill's wrapper when possible:

```sh
./scripts/dshx.sh which
./scripts/dshx.sh <command>
```

From the Harness root, the equivalent is:

```sh
node --import tsx/esm tools/dshx/src/cli.ts <command>
```

## Classify activation before acting

When the request involves installation, delivery, HMR, hot-plugging, refresh, or restart, first run:

```sh
./scripts/dshx.sh kb cat contracts/live-activation
./scripts/dshx.sh activation-plan <plugin> --change <branch>
```

Choose exactly one changed-surface branch:

| Branch | Action | Host restart | Browser reload |
|---|---|---|---|
| `patch` | Edit the watched profile/home `cordis.patch.yml`; verify Host-tree reconcile | No | Only if this adds a client entry |
| `manifest` | Update profile dependency / `dsh.profile.bundles`; verify after the next boot | Yes | Verify client separately |
| `preset` | Write a user-owned preset, then verify it in a new/blank session | No | Only if the current page cached the roster |
| `client` | Rebuild an already-rostered `lib/client.js`; observe client HMR and same-page behavior | No | No; plugin React-local state resets |
| `new-client` | Hot-activate the Host patch entry, then reload/reopen the page for the new graph row | No | Yes |
| `server` | Sync server artifact, then restart the current supervised Host unless exact module HMR is tested | Yes by default | Conditional |
| `artifact` | Synchronize bytes only | Undecided | Undecided |

`sync-artifact` / `ship` must end at `ARTIFACT_SYNCED; LIVE_ACTIVATION_UNPROVEN`. Never turn that result into an activation claim.

Read only the selected branch:

- `patch` → `kb cat playbooks/hot-config-entry`
- `preset` → `kb cat playbooks/activate-user-preset`
- `client` → `kb cat playbooks/update-existing-client-bundle`
- `new-client` → `kb cat playbooks/add-new-client-plugin`
- `server` → `kb cat playbooks/restart-server-plugin`
- ambiguous install/activation → `kb cat pitfalls/installed-is-not-live`

## Develop and prove

1. Read the relevant contract with `kb cat`; a `kb search` snippet is only an id pointer.
2. Edit `my-plugins/<name>/` or the named package. Keep committed `cordis.yml` portable.
3. Run `check <name>`. Completion: no static contract errors; a client package also has a built lazy-CJS `lib/client.js` handoff.
4. Run `verify-boot <name>` only when an isolated cold boot is needed. Completion: marker and Web HTTP pass. It refuses to stop an existing supervised Host and does not prove current-host activation.
5. If package bytes must reach a profile, run `sync-artifact <dir>` (`ship` is a compatibility alias). Completion: content hash matches; activation remains unproven.
6. Execute the previously selected activation branch. Restart only when that branch requires it.
7. Report evidence by layer: `SOURCE_BUILT`, `ARTIFACT_SYNCED`, `NEXT_BOOT_REGISTERED`, `HOST_TREE_ACTIVE`, `CLIENT_LOADED`, `VISUAL_BEHAVIOR_VERIFIED`. Omit unobserved layers.

## Plugin-form checks

- Namespace function: named `apply`; optional `name` and `inject`; no default export in the same module.
- Object: default-export `{ apply, name?, inject? }` and set `kind: object`.
- Class/service: default-export the constructor and set `kind: class`.
- Tool: inject `tools` and register with `defineTool`.
- Client: `exports["./client"]` must target built `lib/client.js` containing `window.__ModuleLoader__.load({ id, factory })`; source TSX is not a served client artifact.

## Hard guardrails

- Never kill or restart `dsh` from inside a Harness session.
- `restart-supervised` may restart only the currently live dshx-owned Web Host. It must not resurrect stale `last-host.json` or reconstruct a headless task.
- Never mount the same plugin through both a bundle and a user-patch insert.
- Never treat `dump-config` as a boot or live-Loader proof.
- `cordis_define` / `cordis_run` are process memory, not a shippable plugin.
- Do not commit `.env`, `.dshx/`, secrets, or machine-absolute plugin paths.
- A scarred 400/orphan-tool-call session needs a new session; do not Continue it.
