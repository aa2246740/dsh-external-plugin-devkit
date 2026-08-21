# dshx

[English](README.en.md) · [中文](README.md)

An out-of-process plugin workshop for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). For Cursor, Claude Code, Codex, Grok, and humans.

Official Creator Mode is for probing a live process. dshx is the other half: write the plugin as files, check the contract, name the layer you changed, then decide whether the Host restarts or the page reloads. It is not `dsh`, not a Harness fork, and not a plugin pack.

![Local dshx activation-plan run: inventory for the hello plugin, then a patch branch that needs no Host restart and no page reload](docs/screenshots/activation-plan.gif)

That GIF is the local CLI. This machine has a DeepSeek Harness checkout, but Harness dependencies were not installed and the official Web UI was not booted. There is no official window to show.

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

The five stills below are from the same local run. The `dump-config` errors in `doctor` and `activation-plan` are real: Harness’s own packages were not installed here.

`setup` puts the launcher in place and leaves the Host alone:

![dshx setup: launcher, skill, and checkout all OK; notes that it will not start or stop dsh](docs/screenshots/setup.png)

`which` names the Harness checkout and the skill paths in use:

![dshx which: 0.6.2, Harness from config, skill linked for agents and Cursor](docs/screenshots/which.png)

`doctor` is a workshop diagnostic. It is not official `dsh doctor` — that command does not exist:

![dshx doctor: Node and the source launcher pass; DSH home is missing; dump-config fails on a missing js-yaml package](docs/screenshots/doctor.png)

`check` is the on-disk contract. A fresh `init` of `hello` can pass:

![dshx check hello: manifest, named apply, boot marker, and a relative overlay all OK](docs/screenshots/check.png)

`activation-plan` reads disk facts, then takes one changed surface. This run chose `patch`: reconcile in place, do not restart the Host:

![dshx activation-plan hello --change patch: method is watched cordis.patch.yml; host-restart and browser-reload are not-required; dump-config is still red](docs/screenshots/activation-plan.png)

## There is no universal hot reload

A watched patch, a next-boot bundle, a user preset, a client already on the page, a new client entry, a server module, and a copied artifact are seven different states. Read the contract, then pick one branch:

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

Use `verify-boot` only when you need an isolated cold-boot proof. Use `sync-artifact` only when a package must land in the profile — it will say `ARTIFACT_SYNCED; LIVE_ACTIVATION_UNPROVEN` and stop there.

Optional Creator Mode+ is a user preset that exposes six fixed tools. See [knowledge/contracts/creator-mode-plus.md](knowledge/contracts/creator-mode-plus.md).

More: [start here](knowledge/start-here.md) · [why work outside Creator Mode](knowledge/why-external.md) · [command surface](knowledge/references/dshx-cli.md) · [standing orders](AGENTS.md)

## License

MIT. DeepSeek Harness is a separate project. This repo is not affiliated with DeepSeek.
