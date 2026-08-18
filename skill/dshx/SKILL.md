---
name: dshx
description: >-
  Call the unofficial dshx CLI and look up its OKF knowledge bundle for
  DeepSeek Harness out-of-process plugins. Use when the user says dshx, /dshx,
  dsh-external-plugin-devkit, knowledge bundle, kb cat, kb search, my-plugins,
  Creator Mode plugin delivery, setup a plugin workshop, ship a file: plugin,
  or asks how to check, verify, or restart a DSH plugin from outside the host.
  Not official dsh.
---

# dshx

`dshx` (*dsh* + *xternal*) is the out-of-process plugin workshop for DeepSeek Harness. It is not official `dsh`, not a Harness fork, and not a plugin pack. Official `dsh doctor` does not exist; `dshx doctor` is this workshop's command.

Source: https://github.com/aa2246740/dsh-external-plugin-devkit

## Resolve the checkout

`dshx` only runs inside a DeepSeek Harness checkout that has:

- `apps/cli/src/bin.ts`
- `tools/dshx/src/cli.ts`

This session's cwd is often **not** that checkout.

1. `$DSHX_HARNESS` when set.
2. Walk up from cwd.
3. `~/.config/dshx/harness` (written by `dshx setup`).

If several checkouts appear, **stop and ask**. Do not guess. Do not hardcode another machine's path.

If `tools/dshx` is missing, run `dshx setup --harness <checkout>` or clone this repo into `<harness>/tools/dshx`. Scratch plugins go in `<harness>/my-plugins/`. State lives in `<harness>/.dshx/` — do not commit it.

## Invoke

Prefer the bundled wrapper. It finds the checkout and execs the CLI, so `pnpm` does not resolve the wrong cwd:

```bash
SCRIPT="$(dirname "$0")/scripts/dshx.sh"
# from this skill directory:
./scripts/dshx.sh <args>
```

Equivalent, from the Harness root only:

```bash
node --import tsx/esm tools/dshx/src/cli.ts <args>
```

Confirm paths with `./scripts/dshx.sh which`. First-time machine: `./scripts/dshx.sh setup --print-prompt` then `setup` / `setup --dry-run`.

## Knowledge bundle

The contract digest lives in the checkout, not in this skill:

```text
<harness>/tools/dshx/knowledge/     # OKF v0.2
```

```bash
./scripts/dshx.sh kb
./scripts/dshx.sh kb cat start-here
./scripts/dshx.sh kb cat maps/symptoms
./scripts/dshx.sh kb search <topic>
./scripts/dshx.sh kb cat <id-from-search>
```

`kb search` only finds an id. **Search snippets are not the contract.** After a hit, `kb cat` that id.

## Workshop loop

1. Read the bundle (`kb`, then `kb cat maps/symptoms` when debugging).
2. `init <name>` (`--kind tool` or `--kind client` for a settings/slot stub). Keep `cordis.yml` portable.
3. `check <name>`
4. `verify <name>` — `dump-config` exit 0 is not a boot proof.
5. Restart only with `restart` / `stop` / `start` from **outside** Creator Mode.
6. `file:` profile packages: `ship <dir>` (remove + add). `plugin add file:` saying "Already up to date" does **not** recopy `lib/`. See `kb cat pitfalls/file-copy-stale`.
7. Session 400 or stuck running → `session list`, then a new chat.

Function plugins: named exports `name` / `inject` / `apply` (no default export).

Hard guardrails:

- Never `kill` the `dsh` host from inside a Harness session.
- `cordis_define` / `cordis_run` are process memory, not a shippable plugin.
- Do not commit `.env`, `.dshx/`, or machine-absolute plugin paths.
- Do not start or stop `dsh` during `setup`.
