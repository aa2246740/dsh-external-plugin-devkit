# Codex-style `$skill` plugin

This plugin is the Codex-matching half of skill invocation:

| Prefix | Codex | Official DSH | This plugin |
|---|---|---|---|
| `$name` | invoke skill | nothing | invoke skill |
| `/name` | built-in command | invoke skill | still official `/name` |
| `@` | pick a skill, insert `$name` | files / Cordis | optional extra source, see below |
| Type `$` | skill picker | no `$` in `TriggerChar` | not possible from a plugin |

`$` is Codex's skill prefix. `/` is Codex's command prefix. Matching Codex means **`$` invokes skills**. It does not mean "both prefixes". OpenAI closed the `/skill` request as by design.

`$1` / `$2` stay placeholders. A skill name must start with a letter, then lowercase letters, digits, or hyphen groups (`$editing-cordis-compositions`).

## What this plugin can do

Copy it into `my-plugins/codex-skill` and start it as a function plugin. The next user-source turn that contains `$skill-name` injects the same `<skill_content>` block official `/name` uses.

It cannot:

- unregister official `/name` (official `dsh-tool-skill` is always loaded)
- open a `$` composer menu (`TriggerChar` is only `'/' | '@'`)
- decorate `$name` as a mention chip (conversation `TEXT_REF_RE` is `/@` only)

Those two UI pieces need the optional core patch in `patches/dollar-trigger.md`.

The `src/client/index.tsx` source is an extra `@` picker that inserts `$name`. It is **not** activated by this function plugin's `cordis.yml`. Activate it only if you also have a client plugin / `dshx new-client` scaffold that imports this file and sets `externalClientBundle`. That is a different activation path (`--kind client` + page reload), not the default install below.

## Install

From a harness checkout that already has `tools/dshx`:

```sh
cp -R tools/dshx/examples/codex-skill my-plugins/codex-skill
dshx check codex-skill
dshx activation-plan codex-skill --change patch
dshx start web codex-skill
```

Then in a session:

```text
$editing-cordis-compositions
```

Creator mode still uses `/editing-cordis-compositions` unless this plugin is loaded. After load, `$editing-cordis-compositions` injects the same skill body.

## Verify

```sh
dshx check examples/codex-skill
npm test -- tests/codex-skill.spec.ts
```
