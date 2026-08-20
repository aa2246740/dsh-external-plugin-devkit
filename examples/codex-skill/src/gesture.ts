/**
 * Codex-style `$name` skill gesture.
 *
 * Mirrors the official `/name` scanner in `@deepseek-ai/dsh-tool-skill`:
 * whitespace-bounded kebab-case names, first-seen order, user-source only.
 * `$1` / `$ARGUMENTS` / `$HOME` do not match (numeric-only, uppercase, or env).
 */

export const DOLLAR_SKILL_GESTURE = /(^|\s)\$([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?=\s|$)/g

export interface GestureBlock {
  readonly type: string
  readonly text?: string
}

export interface GestureMessage {
  readonly source: { readonly kind?: unknown }
  readonly content: readonly GestureBlock[]
}

/**
 * `$name` tokens from claimed user messages, deduplicated in first-seen order.
 * Unknown names stay in the list; the host lookup decides whether to inject.
 */
export function invokedDollarSkillNames(messages: readonly GestureMessage[]): string[] {
  const names: string[] = []
  for (const message of messages) {
    if ((message.source as { kind?: unknown }).kind !== 'user') continue
    for (const block of message.content) {
      if (block.type !== 'text' || typeof block.text !== 'string') continue
      for (const match of block.text.matchAll(DOLLAR_SKILL_GESTURE)) {
        const name = match[2]
        if (name !== undefined && !names.includes(name)) names.push(name)
      }
    }
  }
  return names
}
