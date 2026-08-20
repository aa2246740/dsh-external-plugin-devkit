# dshx

External-plugin workshop for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

`dshx` sits **beside** a harness checkout. It does not replace `dsh`, and it does not live inside `packages/`.

## What this is

- A CLI that scaffolds, checks, and activates **your** plugins against a real DSH tree.
- A knowledge base that answers from official DSH files, not from memory.
- A set of example plugins that prove the extension points the workshop claims.

## Layout

```text
<harness-checkout>/
  apps/cli/          official DSH
  packages/          official DSH
  tools/dshx/        this workshop, copied or cloned beside the tree
  my-plugins/        your plugins (gitignored by the workshop's local ignore rules)
```

`my-plugins/` is outside `packages/` on purpose. Official DSH only auto-loads `packages/dsh-plugin-*`. Your plugins are activated by `dshx start`, which writes `config.local.yml` / `agent.local.yml` and, for `--kind client`, `externalClientBundle`.

## Quick start

```sh
# from a harness checkout that already has tools/dshx
npm install -g .
# or: npm link

dshx doctor
dshx new demo --kind function
dshx check demo
dshx activation-plan demo --change patch
dshx start web demo
```

Client plugins need a page reload after `dshx start` writes `externalClientBundle`.

## Codex-style `$skill`

Official DSH invokes user-typed skills with `/name`. Codex invokes them with `$name`. `/` in Codex is for built-in commands, not skills.

The workshop example is `examples/codex-skill`. Copy it into `my-plugins/` and start it as a function plugin. Details: [knowledge/contracts/codex-skill.md](knowledge/contracts/codex-skill.md).

```sh
cp -R tools/dshx/examples/codex-skill my-plugins/codex-skill
dshx check codex-skill
dshx start web codex-skill
```

Then type `$editing-cordis-compositions` in a session. Official `/name` still works; a plugin cannot unregister it.

## Commands

| Command | What it does |
|---|---|
| `dshx doctor` | Verify the adjacent harness + Node + this package |
| `dshx new` | Scaffold a function plugin into `my-plugins/` |
| `dshx new-client` | Scaffold a client plugin + Vite/React compiler |
| `dshx check` | Static check against the published contract |
| `dshx activation-plan` | Print the exact files `dshx start` will write |
| `dshx start` | Write local DSH config and run `dsh web` / `dsh tui` |
| `dshx inspect` | Dump resolved plugin / command / skill / i18n / tool state |
| `dshx okf` | Append or search operator-knowledge facts |
| `dshx kb` | Search the workshop knowledge base |
| `dshx snapshot-official` | Record the official DSH commit this workshop is pinned to |

## Knowledge

Start at [knowledge/index.md](knowledge/index.md). Every playbook cites official files. The current official pin is `dsh-v0.1.0-rc.8` / `141eb6f`.

## Tests

```sh
npm test
```

The suite checks the CLI, knowledge retrieval fixtures, example plugins, and the published activation/layout contracts. It does not boot a full DSH app.
