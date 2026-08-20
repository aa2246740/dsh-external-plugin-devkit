# codex-skill

Codex-style `$skill` invocation for DeepSeek Harness.

Copy this directory to `<harness>/my-plugins/codex-skill`, or:

```sh
cp -R tools/dshx/examples/codex-skill my-plugins/codex-skill
dshx check codex-skill
dshx activation-plan codex-skill --change patch
dshx start web codex-skill
```

Host half is a namespace function plugin (`apply`, no default export). Keep `cordis.yml` `name` relative.

## What Codex actually does

Codex does **not** treat `/skill-name` as a skill. OpenAI closed those bugs as by design:

| Prefix | Codex | DSH today | This plugin |
|---|---|---|---|
| `$name` | Invoke skill | Nothing | **Adds** host injection |
| `/command` | Built-in slash commands | `ctx.commands` | Unchanged |
| `/skill-name` | Unrecognized command | Official `dsh-tool-skill` still injects | Unchanged (plugin cannot unregister it) |
| `@` then pick a skill | Unified mention; inserts `$name` | Files / Cordis plugins | Optional client half inserts `$name` |
| Type `$` for a skill-only picker | Yes | `TriggerChar` is `'/' \\| '@'` only | Needs the optional core patch |

Matching Codex means: **`$` invokes skills, `/` stays commands.** Both prefixes at once is not Codex.

## Host behavior (this example)

Whitespace-bounded `$kebab-name` in a claimed user message loads that user-invocable skill and appends the same `<skill_content>` block official `/name` uses. Mid-sentence works. Paths, `$HOME`, `$1`, and `$ARGUMENTS` do not match.

```text
$editing-cordex-compositions draft a preset
please use $hidden-demo to answer this
```

Unknown names stay ordinary prose.

## Client picker

`src/client/index.tsx` is the optional browser half. RC8 cannot open a menu on `$` because detection only scans `/` and `@`. The client therefore registers an `@` source named `skill-dollar` that inserts `$name ` — the Codex unified-mention path.

That half is **not** activated by the function `cordis.yml` row. Promote it with `dshx init … --kind client` (or copy the official client scaffold) and follow [add-new-client-plugin](../../knowledge/playbooks/add-new-client-plugin.md). After the optional [dollar-trigger patch](patches/dollar-trigger.md), the same catalog can also bind `trigger: '$'`.

## Creator Mode

Creator Mode is shipped preset `cordis`, not a separate runtime. It already has Standard tools plus `dsh-tool-cordis` and two preset skills. This plugin is file-backed and belongs in `my-plugins/`, not in `cordis_define` memory. See [creator-mode](../../knowledge/contracts/creator-mode.md) and [codex-skill](../../knowledge/contracts/codex-skill.md).
