# Optional DSH core patch: `$` as a composer trigger

RC8 freezes `TriggerChar` as `'/' | '@'`. A client plugin can register `trigger: '$'`, but `detectTrigger()` never looks for `$`, and draft chips only scan `/` and `@`. This is the smallest core change that makes typing `$` open the skill menu the way Codex does.

Do **not** put this patch in a user `cordis.patch.yml`. It is a Harness source change. Prefer an upstream PR on `deepseek-ai/deepseek-harness`.

Pinned against `dsh-v0.1.0-rc.8` / `141eb6fef83422698aef7a981029e843e8161534`.

## 1. `packages/client/ui-input-trigger/src/types.ts`

```ts
export type TriggerChar = '/' | '@' | '$'
```

`TriggerGuard` comment: claimed tier should keep `$` live the same way `@` stays live (a command claim does not suppress skill mentions).

## 2. `packages/client/ui-input-trigger/src/core/detect.ts`

After the `@` grammar, the left-scan currently only accepts `/`. Treat `$` as a second slash-like trigger **without** the URL carve-outs (`https:/`, `//`):

```ts
    if (ch !== '/' && ch !== '$') continue
    if (ch === '/' && guard.tier === 'claimed') continue
    if (!boundaryOk(draft, i, ch)) continue
```

`$` after a word char stays dead (`VAR$name`). `$` at start-of-draft, after whitespace, or after punctuation opens.

## 3. `packages/client/ui-conversation/src/client/input/decorations.ts`

```ts
const TEXT_REF_RE = /(^|\s)([/@$])([\w-]+)/g
```

Widen `TextRefRange.trigger` and `scanTextRefs` lexicon keys to `TriggerChar` (or `'/' | '@' | '$'`).

## 4. Client source after the patch

Register a second `InputTriggerSource`:

```ts
{
  trigger: '$',
  name: 'skill',
  order: 0,
  // same catalog / lexicon as the @ skill-dollar source
  onPick({ candidate }) {
    return { text: `$${candidate.name} ` }
  },
}
```

Do not give this source `matchEnter`. `$name extra prose` must stay a model prompt, exactly like official `/skill` (no command claim).

## Tests to add upstream

- `detectTrigger(' $edit', 6, { tier: 'plain' })` hits `$` with query `edit`
- `detectTrigger('https://x', …)` still ignores URL slashes
- `scanTextRefs('$hidden-demo please', lexicon)` paints the `$hidden-demo` range
- Enter on `$hidden-demo go` uses default-sink, not command adjudication
