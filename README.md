# dsh-external-plugin-devkit

**CLI: dshx** — an out-of-process plugin workshop for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

dshx helps Cursor, Claude Code, Codex, Grok, and humans build file-backed plugins without confusing session memory, artifact delivery, live Host activation, and browser activation. Its optional Creator Mode+ bridge exposes only fixed safe dshx operations inside the official WebUI; the external CLI remains the supervisor.

This project is unofficial. It is not dsh, not a Harness fork, and not a plugin pack. Official dsh doctor does not exist; dshx doctor is this workshop's diagnostic command.

## Install

dshx lives inside one DeepSeek Harness checkout:

~~~sh
cd /path/to/deepseek-harness
git clone https://github.com/aa2246740/dsh-external-plugin-devkit.git tools/dshx
node --import tsx/esm tools/dshx/src/cli.ts setup --harness "$PWD"
~~~

setup installs a user launcher at `~/.local/bin/dshx` and the dshx skill into Agent homes already present on the machine, then records the selected checkout in `~/.config/dshx/harness`. It does not edit Harness `package.json`, start DSH, or stop DSH.

Every command accepts `--harness <path>`. An explicit flag is the only
checkout override. Without it, `DSHX_HARNESS`, `~/.config/dshx/harness`, and
the checkout found by walking upward are treated as independent evidence; all
discovered roots must agree. This prevents a command run inside an old clone
from silently mutating a newer one.

Prompt for another Agent:

> Install https://github.com/aa2246740/dsh-external-plugin-devkit at &lt;harness&gt;/tools/dshx, run `dshx setup --harness &lt;harness&gt;`, then run `dshx which --harness &lt;harness&gt;` and `dshx doctor --harness &lt;harness&gt;`. Without an explicit flag, stop if checkout discovery conflicts. Do not start or kill DSH and do not hardcode another machine's path.

## Start with the lifecycle contract

~~~sh
dshx kb cat contracts/live-activation
dshx activation-plan <plugin> --change patch
~~~

There is no universal “hot reload” operation:

| Changed surface | Current Host | Open browser page |
|---|---|---|
| Watched profile/home cordis.patch.yml | Reconciles in the same PID | New client rows still need page reload |
| package.json / dsh.profile.bundles | Takes effect on the next Host boot | Verify after boot |
| User `.agent-presets/<id>` | Re-discovered without a Host restart | Use a new/blank session; reload only if the roster is cached |
| Existing client lib/client.js | Client HMR can replace the entry | Same page; plugin local React state resets |
| New client entry | Host patch can activate without restart | Reload/reopen the page |
| Server module | Restart by default unless exact module HMR is tested | Verify separately |
| Artifact copy/link only | No activation claim | No activation claim |

The authoritative explanation and official source pointers are in [knowledge/contracts/live-activation.md](knowledge/contracts/live-activation.md).

## Optional Creator Mode+

Creator Mode+ makes this package itself a preset-scoped DSH plugin through the
`dsh-external-plugin-devkit/creator-plus` export. It supports the official DSH
browser WebUI and public Cordis/client extension points. App-shell IPC, native
menus, window chrome, and wrapper-specific refresh behavior are outside the
compatibility boundary.

~~~sh
# From the Harness checkout. This writes a plain profile dependency, not a bundle.
pnpm dsh plugin --profile web add link:./tools/dshx

# Refuses to overwrite an existing user preset.
DSHX_HARNESS="$PWD" pnpm --dir tools/dshx install:creator-plus
~~~

Open or refresh the official WebUI only if its preset roster was already cached,
select **Creator Mode+**, and start a new or still-blank session. No Host restart
is required for preset discovery. The bridge exposes only `dshx_scaffold`,
`dshx_check`, `dshx_activation_plan`, and `dshx_status`; it exposes no arbitrary
shell/argv/path operation and no start, stop, or restart operation.

RC8 adds optional Codex and Claude Code subagent Profile Bundles. Creator Mode+
inherits their disabled tool rows from Standard, but never installs or enables
them automatically: installing a provider is a `manifest` change and needs a
Profile restart; enabling its copied preset row is a `preset` change and needs a
new session.

## Development flow

~~~sh
dshx kb cat start-here
dshx init demo --kind function
dshx check demo
dshx verify-boot demo

# For a packaged plugin whose bytes must reach the profile:
dshx sync-artifact /absolute/path/to/package

# Then select the actual changed surface:
dshx activation-plan demo --change patch
~~~

verify-boot is an isolated cold-boot computation. It refuses to stop a live dshx-supervised Host and does not prove current-host activation.

sync-artifact (compatibility aliases: ship and recopy) verifies package content and ends with:

~~~text
ARTIFACT_SYNCED; LIVE_ACTIVATION_UNPROVEN
~~~

The old ship --restart chain is intentionally rejected. Restart only after activation-plan selects a manifest/server branch:

~~~sh
dshx status
dshx restart-supervised
~~~

restart-supervised only restarts the current dshx-owned Web PID. It will not resurrect stale last-host state or reconstruct a headless task.

## Command surface

~~~text
kb cat/search/lint       Navigate the OKF contract bundle
init                     Scaffold function, tool, client, object, or class form
check                    Static plugin/path/client-artifact checks
verify-boot              Isolated cold boot: dump + marker + HTTP
activation-plan          Read-only lifecycle inventory and changed-surface plan
sync-artifact            Local link or legacy file: artifact synchronization
start / stop             Explicit workshop Host control
restart-supervised       Restart the current owned Web Host only
status / logs            Supervisor and launcher-log state
doctor                   Profile/workshop diagnostics; unofficial
session                  Inspect session scars
which                    Resolve checkout and installed skill paths
~~~

Run dshx help for flags and examples.

## Plugin forms

- Namespace function: named apply; optional name and inject; no default export in that namespace module.
- Object: default export with apply and kind: object.
- Class/service: default-exported constructor and kind: class.
- Tool: inject tools and register through defineTool.
- Client: exports["./client"] points to built lib/client.js. The artifact must call window.__ModuleLoader__.load({ id, factory }); source TSX is not a runnable browser entry. On RC8, out-of-tree `my-plugins/*` use dshx `externalClientBundle`; the official `clientBundle()` manifest lookup is intentionally limited to `packages/*/*`.

init --kind client creates the source and the correct lib/client.js export target, then clearly leaves check red until a compatible client artifact is built.

## Evidence levels

Report only what was observed:

~~~text
SOURCE_BUILT
ARTIFACT_SYNCED
NEXT_BOOT_REGISTERED
PRESET_ROSTER_VISIBLE
PRESET_SESSION_ACTIVE
HOST_TREE_ACTIVE
CLIENT_LOADED
VISUAL_BEHAVIOR_VERIFIED
~~~

Package installation, dump-config, HTTP 200, and a cold-boot marker do not substitute for later levels.

## Safety

- Never kill or restart DSH from inside a Harness session.
- Never mount the same plugin through both bundle and user-patch rows.
- Never commit .env, .dshx/, secrets, or machine-absolute plugin paths.
- Original Creator Mode cordis_define / cordis_run packages are process-memory probes, not profile-plugin delivery. Creator Mode+ is a separate user preset backed by file-based dshx operations.
- A session already scarred by an orphan tool_call needs a new session.

## Knowledge bundle

[knowledge/](knowledge/) is an OKF v0.2 digest pinned to official DeepSeek Harness dsh-v0.1.0-rc.8 source for the lifecycle and external-client update. Search returns an id; always cat the hit before using it as a contract.

Repository standing orders are in [AGENTS.md](AGENTS.md), and the portable Agent skill is [skill/dshx/SKILL.md](skill/dshx/SKILL.md).

## License

MIT for this repository. DeepSeek Harness is a separate project with its own license. This project is not affiliated with DeepSeek.
