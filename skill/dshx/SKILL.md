---
name: dshx
description: >-
  Use the unofficial dshx CLI and its OKF bundle for DeepSeek Harness external
  plugin work. Trigger when the user says dshx, /dshx, dsh-external-plugin-devkit,
  my-plugins, Creator Mode delivery, plugin add/ship/check/verify, HMR, hot reload,
  热重载, 热插拔, 不重启, Creator+ Guardian, 多个 Creator+, 自救, 自愈, or asks
  whether a DSH plugin needs a browser reload or Host restart. Before any
  ship/restart advice, classify the changed surface with contracts/live-activation.
  Not official dsh.
---

# dshx

Use `dshx` for profile-scoped, file-backed plugins developed by an external agent or through the optional Creator Mode+ safe bridge. The CLI and Guardian outside DSH are the supervisor; Creator Mode+ exposes six fixed operations, including plugin claims and bounded new-client activation, but never process control. Do not transfer the original Creator Mode's in-memory lifecycle assumptions to external packages.

In Creator Mode+, session-start automatically arms the external Guardian. As soon
as one plugin id is known, call `dshx_claim_plugin` before scaffold/edit/build/check.
The bridge repeats the claim before every named operation as a fail-safe. Different
sessions may work on different plugins concurrently; the same plugin fails closed
for a second owner, and only live watched-patch activation is globally serialized.
Read `kb cat contracts/creator-guardian` for attribution and recovery semantics.
For a new Creator+ project, call the fixed scaffold immediately after claim. It
uses the immutable session cwd, returns the only source path the Agent edits, and
creates the Harness `my-plugins` link when needed. Run activation-plan after that
target exists and before implementation; existing projects skip scaffold.
If a fixed tool throws `refusing an operation outside bridge v2`, treat it as a
Creator Bridge integrity defect: quote the exact tool and error, preserve the
current plugin location, and stop. It is not permission to use raw dshx, mount the
plugin manually, move it to another workspace, or infer that the lifecycle step
succeeded. Retry that fixed tool only after upgrading the bridge.

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

When the target already exists and the request involves installation, delivery, HMR, hot-plugging, refresh, or restart, first run:

```sh
./scripts/dshx.sh kb cat contracts/live-activation
./scripts/dshx.sh activation-plan <plugin> --change <branch>
```

Choose exactly one changed-surface branch:

| Branch | Action | Host restart | Browser reload |
|---|---|---|---|
| `patch` | Edit the watched profile/home `cordis.patch.yml`; verify Host-tree reconcile | No | Only if this adds a client entry |
| `manifest` | Update profile dependency / `dsh.profile.bundles`; verify after the next boot | Yes | Verify client separately |
| `preset` | Write a user-owned preset, preserve its composition stamp when bytes are unchanged, then verify it in a new/blank session | No, when process-global resources are generation-safe | Only if the current page cached the roster |
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

1. Read the relevant contract with `kb cat`; a `kb search` snippet is only an id pointer. In Creator Mode+, claim the chosen plugin before changing it.
2. For a new Creator+ project, use `dshx_scaffold`, then plan the now-resolvable target. Edit only the returned session-workspace path; never ask the user to create a symlink.
3. For an existing project, edit `my-plugins/<name>/` or the named package. Keep committed `cordis.yml` portable.
4. For a client package, read `kb cat contracts/client-build`. On RC8, an out-of-tree package must build with dshx `externalClientBundle`; do not import the repository-internal official `clientBundle()` or move the plugin under `packages/`.
5. Run `check <name>`. Completion: no static contract errors; a client package also passes `client-cordis-inject` and has a built lazy-CJS `lib/client.js` handoff.
6. Run `verify-boot <name>` only when an isolated cold boot is needed. Completion: marker and Web HTTP pass. It refuses to stop an existing supervised Host and does not prove current-host activation.
7. If package bytes must reach a profile, run `sync-artifact <dir>` (`ship` is a compatibility alias). Completion: content hash matches; activation remains unproven.
8. Execute the previously selected activation branch. For `new-client`, use only `activate-new-client`; restart only when a different branch requires it.
9. Report evidence by layer: `SOURCE_BUILT`, `ARTIFACT_SYNCED`, `NEXT_BOOT_REGISTERED`, `HOST_TREE_ACTIVE`, `CLIENT_LOADED`, `VISUAL_BEHAVIOR_VERIFIED`. Omit unobserved layers.

## Plugin-form checks

- Namespace function: named `apply`; optional `name` and `inject`; no default export in the same module.
- Object: default-export `{ apply, name?, inject? }` and set `kind: object`.
- Class/service: default-export the constructor and set `kind: class`.
- Tool: inject `tools` and register with `defineTool`.
- Client: `exports["./client"]` must target built `lib/client.js` containing `window.__ModuleLoader__.load({ id, factory })`; source TSX is not a served client artifact. Every direct `ctx.<service>` read must appear in the client entry's Cordis `export const inject`; `package.json` `dsh.client.inject` is unrelated package metadata. RC8 external packages use dshx `externalClientBundle`, while official `packages/client/tsdown.client.ts` remains the in-repository workspace preset.

## Hard guardrails

- Never kill or restart `dsh` from inside a Harness session.
- A raw `dshx` process launched by a DSH-managed shell (`DSH_SHELL=1`) is still inside the Host boundary. DSHX rejects its mutating/process commands; use the fixed Creator+ tools or an external terminal. Never unset managed environment markers to bypass this guard.
- A fixed-tool `outside bridge v2` rejection is a bridge defect, not a supervisor denial. Stop at that tool; do not substitute manual profile installation or report downstream success.
- If a `[Creator+ Guardian incident ...]` steering message arrives, pause the prior task, inspect its confidence/plugin/rollback/log evidence, repair the preserved source, and run `dshx_check` before retrying the same activation branch.
- Guardian may quarantine and restore a failed Web Host once from outside DSH. Its same-origin browser sentry may also quarantine one uniquely attributed official Loader `FAILED` entry and reload only after the live manifest proves it absent. Neither path makes process control model-facing or proves visual/functional correctness.
- Manual `stop` / `restart-supervised` must refuse an adopted official Host; normal launcher exit disarms Guardian.
- Never bypass a failed `activate-new-client` by manually editing profile `package.json` or `cordis.patch.yml`; fix the reported blocker and retry the bounded command.
- `restart-supervised` may restart only the currently live dshx-owned Web Host. It must not resurrect stale `last-host.json` or reconstruct a headless task.
- Never mount the same plugin through both a bundle and a user-patch insert.
- RC8 may keep old and new preset generations alive together. Any exact route, singleton, or other process-global resource owned by a preset must use a Host-scoped cross-generation lease, or move to Host composition. A managed upgrade must preserve the exact `agent.cordis.yml` stamp when its bytes are unchanged.
- Never treat `dump-config` as a boot or live-Loader proof.
- `cordis_define` / `cordis_run` are process memory, not a shippable plugin.
- Do not commit `.env`, `.dshx/`, secrets, or machine-absolute plugin paths.
- A scarred 400/orphan-tool-call session needs a new session; do not Continue it.
- RC8 `dsh web` opens a browser unless passed `--no-open`; dshx-supervised Web and cold-boot commands must suppress that side effect.
