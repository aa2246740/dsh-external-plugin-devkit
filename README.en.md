# dshx

[English](README.en.md) · [中文](README.md)

An out-of-process plugin workshop for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). For Cursor, Claude Code, Codex, Grok, and humans.

Official Creator Mode is for probing a live process. dshx is the other half: write the plugin as files, check the contract, name the layer you changed, then decide whether the Host restarts or the page reloads. It is not `dsh`, not a Harness fork, and not a plugin pack.

![Local dshx activation-plan run: inventory for the hello plugin, then a patch branch that needs no Host restart and no page reload](docs/screenshots/activation-plan.gif)

That GIF is the local CLI. This machine has a DeepSeek Harness checkout with dependencies installed, so `doctor` and `activation-plan` can run `dump-config`. The official Web UI was not booted. There is no official window to show.

## Install

```sh
cd /path/to/deepseek-harness
git clone https://github.com/aa2246740/dsh-external-plugin-devkit.git tools/dshx
node --import tsx/esm tools/dshx/src/cli.ts setup --harness "$PWD"
dshx which && dshx doctor
```

`setup` installs a user launcher and the skill, and remembers this checkout. It does not edit Harness `package.json`, and it does not start or stop DSH.

If more than one checkout is in play, pass `--harness`. Do not let the tool guess.

You can hand the block above to an Agent. `dshx setup --print-prompt` prints the full ask.

## What it looks like

The five stills below are from the same local run. `dump-config` exited 0 — that is not a boot proof, and the official UI was not opened.

`setup` puts the launcher in place and leaves the Host alone:

![dshx setup: launcher, skill, and checkout all OK; notes that it will not start or stop dsh](docs/screenshots/setup.png)

`which` names the Harness checkout and the skill paths in use:

![dshx which: 0.6.2, Harness from config, skill linked for agents and Cursor](docs/screenshots/which.png)

`doctor` is a workshop diagnostic. It is not official `dsh doctor` — that command does not exist:

![dshx doctor: Node, the source launcher, and dump-config pass; dump-config is not a boot proof; no Host is supervised](docs/screenshots/doctor.png)

`check` is the on-disk contract. A fresh `init` of `hello` can pass:

![dshx check hello: manifest, named apply, boot marker, and a relative overlay all OK](docs/screenshots/check.png)

`activation-plan` reads disk facts, then takes one changed surface. This run chose `patch`: reconcile in place, do not restart the Host:

![dshx activation-plan hello --change patch: method is watched cordis.patch.yml; host-restart and browser-reload are not-required](docs/screenshots/activation-plan.png)

## There is no universal hot reload

A watched patch, a next-boot bundle, a user preset, a client already on the page, a new client entry, a server module, and a copied artifact are seven different states. Read the contract, then pick one branch:

Keep the same DSH PID by default and classify the runtime surface that must change. A plain profile dependency is a resolution prerequisite, not manifest activation or restart evidence. A first Web client remains `new-client` even though its activation writes a dependency: hot-mount the Host row, then reload/reopen the page. Only boot-captured bundle composition or a server module without tested HMR authorizes a normal Host restart.

```sh
dshx kb cat contracts/live-activation
dshx activation-plan <plugin> --change patch
```

The matrix lives in [knowledge/contracts/live-activation.md](knowledge/contracts/live-activation.md).

## A normal day

```sh
dshx init demo --kind function
dshx check demo
dshx activation-plan demo --change patch
```

## Harness update assistant

An update is more than `git pull`. DSHX 0.7.0 gates the official release, the Harness build, every local plugin, and exact rollback as separate phases:

```sh
dshx update plan
dshx update prepare --target dsh-v0.1.1-rc.2
dshx update verify --target dsh-v0.1.1-rc.2
dshx update apply --target dsh-v0.1.1-rc.2
```

- `plan` reads official `dsh-v*` tags, the current checkout, tracked-dirty risk, and directory/symlink plugin inventory without mutation.
- `prepare` performs a frozen install and full target-Harness build in an isolated worktree, then copies and builds every plugin. It does not switch the active Harness.
- `verify` runs the static contract and an isolated cold boot for every candidate plugin. RC2 Web clients use the native profile package seam and must appear in the boot graph with a 200 `client.js`; server-only plugins must emit their `apply()` marker.
- `apply` accepts only a complete candidate gate, refuses a supervised Host, transactionally switches to `dshx/<release>`, rebuilds the actual plugins, and saves exact checkout, dependency-tree, and plugin-`lib/` backups.
- `rollback` restores the pre-update branch, dependencies, and generated plugin artifacts: `dshx update rollback --target <release>`.

Without `--target`, DSHX queries the latest official release live. The assistant does not restart a production Host: applied bytes, real-runtime acceptance, and production activation remain separate states. See [knowledge/contracts/harness-update.md](knowledge/contracts/harness-update.md).

DSHX 0.7.1 repairs RC2 new-client activation proof by accepting both the older `window.__DSH_BOOT__` assignment and the current official `globalThis["__DSH_BOOT__"]` injection. Creator+ now implements, builds, and passes `check` before running `activation-plan` and same-PID activation for a fresh client.

Use `verify-boot` only when you need an isolated cold-boot proof. Use `sync-artifact` only when a package must land in the profile — it will say `ARTIFACT_SYNCED; LIVE_ACTIVATION_UNPROVEN` and stop there.

Optional Creator Mode+ is a user preset that exposes six fixed tools. See [knowledge/contracts/creator-mode-plus.md](knowledge/contracts/creator-mode-plus.md).

More: [start here](knowledge/start-here.md) · [why work outside Creator Mode](knowledge/why-external.md) · [command surface](knowledge/references/dshx-cli.md) · [standing orders](AGENTS.md)

## License

MIT. DeepSeek Harness is a separate project. This repo is not affiliated with DeepSeek.
