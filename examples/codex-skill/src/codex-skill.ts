/**
 * Codex-style `$skill` invocation for DeepSeek Harness.
 *
 * Official DSH already injects skills for whitespace-bounded `/name`.
 * Codex invokes skills with `$name` and reserves `/` for built-in commands.
 * This plugin adds the `$` path using the same host injection shape.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import {
  isUserInvocable,
  renderSkillContent,
  type SkillInvocationSource,
} from '@deepseek-ai/dsh-skill'
import { invokedDollarSkillNames } from './gesture.ts'

export const name = 'codex-skill'
export const inject = ['agents', 'skills']

export function apply(ctx: Context): void {
  console.log('[my-plugins/codex-skill] loaded')

  // Same waterfall placement as dsh-tool-skill's /name listener: call next()
  // first so catalog / other background injections land before the skill body.
  ctx.on('agent/pre-step', async (
    { agent, messages, signal },
    next,
  ): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    const names = invokedDollarSkillNames(messages)
    if (names.length === 0) return decision
    signal.throwIfAborted()
    const lookup = { cwd: agent.session.header.cwd, signal, scope: agent }
    const injections: UserMessage[] = []
    for (const skillName of names) {
      const skill = await ctx.skills.get(skillName, lookup)
      signal.throwIfAborted()
      if (skill === undefined || !isUserInvocable(skill)) continue
      const source: SkillInvocationSource = {
        kind: 'skill-invocation',
        name: skillName,
        form: 'instructions',
      }
      injections.push(createUserMessage({
        content: [{ type: 'text', text: renderSkillContent(skill) }],
        source,
      }))
    }
    if (injections.length === 0) return decision
    return { kind: 'enter', messages: [...decision.messages, ...injections] }
  })
}
