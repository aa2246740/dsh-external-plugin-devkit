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

Use `dshx` for profile-scoped, file-backed plugins developed by an external agent or through the optional Creator Mode+ safe bridge. The CLI outside DSH is always the supervisor; Creator Mode+ exposes five fixed operations, including bounded new-client activation, but never process control. Do not transfer the original Creator Mode's in-memory lifecycle assumptions to external packages.

## Resolve the checkout

The CLI requires one DeepSeek Harness checkout containing both `apps/cli/src/bin.ts` and `tools/dshx/src/cli.ts`.

Resolve with this fail-closed rule:

1. If the user or command supplies `--harness <path>`, use that checkout after validating it. The explicit flag disambiguates all other discovery sources.
2. Otherwise collect `$DSHX_HARNESS`, `~/.config/dshx/harness`, and the checkout found by walking upward from cwd.
3. Continue only when every discovered source names the same checkout. If they disagree, stop and request an explicit `--harness`; never choose one by precedence.

Never guess or hardcode another machine's path. Run `which --harness <path>` when switching between release checkouts.

Invoke through this skill's wrapper when possible:

```sh
./scripts/dshx.sh which
./scripts/dshx.sh <command>
./scripts/dshx.sh <command> --harness /absolute/path/to/deepseek-harness
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

For `new-client`, do not hand-edit the profile manifest and watched patch as separate steps. After `check` passes and activation is approved, run:

```sh
./scripts/dshx.sh activate-new-client <plugin> --profile web --port <current-web-port>
```

The command owns the safe order: official profile link, resolvability proof, watched-patch insert/retrigger, current Host manifest proof. Exit 0 proves through `CLIENT_MANIFEST_PRESENT`, not `CLIENT_LOADED`; reload the page and verify UI separately. A nonzero exit is a stop condition, not permission to improvise. If it explicitly names a cached pre-install resolution failure from an earlier bad sequence, the external supervisor may perform one controlled restart; this is recovery for the scar, not the normal new-client branch.

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
3. For a client package, read `kb cat contracts/client-build`. On RC8, an out-of-tree package must build with dshx `externalClientBundle`; do not import the repository-internal official `clientBundle()` or move the plugin under `packages/`.
4. Run `check <name>`. Completion: no static contract errors; a client package also has a built lazy-CJS `lib/client.js` handoff.
5. Run `verify-boot <name>` only when an isolated cold boot is needed. Completion: marker and Web HTTP pass. It refuses to stop an existing supervised Host and does not prove current-host activation.
6. If package bytes must reach a profile, run `sync-artifact <dir>` (`ship` is a compatibility alias). Completion: content hash matches; activation remains unproven.
7. Execute the previously selected activation branch. For `new-client`, use only `activate-new-client`; restart only when a different branch requires it.
8. Report evidence by layer: `SOURCE_BUILT`, `ARTIFACT_SYNCED`, `NEXT_BOOT_REGISTERED`, `HOST_TREE_ACTIVE`, `CLIENT_LOADED`, `VISUAL_BEHAVIOR_VERIFIED`. Omit unobserved layers.

## Plugin-form checks

- Namespace function: named `apply`; optional `name` and `inject`; no default export in the same module.
- Object: default-export `{ apply, name?, inject? }` and set `kind: object`.
- Class/service: default-export the constructor and set `kind: class`.
- Tool: inject `tools` and register with `defineTool`.
- Client: `exports["./client"]` must target built `lib/client.js` containing `window.__ModuleLoader__.load({ id, factory })`; source TSX is not a served client artifact. RC8 external packages use dshx `externalClientBundle`, while official `packages/client/tsdown.client.ts` remains the in-repository workspace preset.

## Hard guardrails

- Never kill or restart `dsh` from inside a Harness session.
- Never bypass a failed `activate-new-client` by manually editing profile `package.json` or `cordis.patch.yml`; fix the reported blocker and retry the bounded command.
- `restart-supervised` may restart only the currently live dshx-owned Web Host. It must not resurrect stale `last-host.json` or reconstruct a headless task.
- Never mount the same plugin through both a bundle and a user-patch insert.
- Never treat `dump-config` as a boot or live-Loader proof.
- `cordis_define` / `cordis_run` are process memory, not a shippable plugin.
- Do not commit `.env`, `.dshx/`, secrets, or machine-absolute plugin paths.
- A scarred 400/orphan-tool-call session needs a new session; do not Continue it.
- RC8 `dsh web` opens a browser unless passed `--no-open`; dshx-supervised Web and cold-boot commands must suppress that side effect.
