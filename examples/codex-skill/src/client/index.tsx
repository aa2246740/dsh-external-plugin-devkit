/**
 * Browser half: Codex unified-mention path.
 *
 * RC8 `TriggerChar` is only `'/' | '@'`. Typing `$` does not open a menu
 * until the optional core patch in `patches/dollar-trigger.md` lands.
 * This source registers on `@` (legal today) and inserts `$name `, matching
 * Codex unified mentions: pick a skill from `@`, persist it as `$skill`.
 *
 * Host injection still comes from the `$name` pre-step listener.
 */
import type { ConnectionHandle, SessionId, SkillEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type { InputTriggerServiceContract, InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'

export const name = 'codex-skill-client'
export const inject = ['inputTriggers', 'connection', 'sessions', 'locale', 'remote']

interface CatalogFetch {
  readonly promise: Promise<readonly SkillEntry[]>
  readonly abort: AbortController
  settled?: readonly SkillEntry[]
}

export function apply(ctx: ClientContext): void {
  const skills = (ctx.get('connection') as ConnectionHandle).api.skills
  const sessions = ctx.get('sessions') as ISessions
  const fetches = new Map<SessionId, CatalogFetch>()
  const lexiconListeners = new Map<SessionId, Set<() => void>>()

  const notifyLexicon = (sessionId: SessionId): void => {
    for (const listener of [...(lexiconListeners.get(sessionId) ?? [])]) {
      try {
        listener()
      } catch (error) {
        console.error('[codex-skill] lexicon listener failed:', error)
      }
    }
  }

  const fetchCatalog = (sessionId: SessionId): Promise<readonly SkillEntry[]> => {
    if (sessions.subagentAddress(sessionId) !== undefined) return Promise.resolve([])
    const existing = fetches.get(sessionId)
    if (existing !== undefined) return existing.promise
    const abort = new AbortController()
    const promise = (async () => {
      const { result } = await skills.list({ sessionId }, abort.signal)
      if (!result.ok) throw new Error(`skill.list failed: ${result.error.code}: ${result.error.message}`)
      return result.value.skills
    })()
    const entry: CatalogFetch = { promise, abort }
    fetches.set(sessionId, entry)
    promise.then(
      (listed) => {
        entry.settled = listed
        notifyLexicon(sessionId)
      },
      () => {
        if (fetches.get(sessionId) === entry) fetches.delete(sessionId)
      },
    )
    return promise
  }

  const invalidate = (key: SessionId): void => {
    const entry = fetches.get(key)
    if (entry === undefined) return
    fetches.delete(key)
    entry.abort.abort()
    notifyLexicon(key)
  }

  const clearAll = (): void => {
    for (const key of [...fetches.keys()]) invalidate(key)
  }

  const source: InputTriggerSource = {
    trigger: '@',
    name: 'skill-dollar',
    order: 3,
    async candidates(session, { query, signal }) {
      const listed = await fetchCatalog(session.sessionId)
      if (signal.aborted) return []
      return listed
        .filter(skill => skill.name.startsWith(query))
        .map(skill => ({
          name: skill.name,
          description: skill.modelInvocable
            ? skill.description
            : `user-only · ${skill.description}`,
        }))
    },
    warm(session) {
      fetchCatalog(session.sessionId).catch(() => {})
    },
    lexicon(session) {
      return fetches.get(session.sessionId)?.settled?.map(skill => skill.name)
    },
    subscribeLexicon(session, listener) {
      const key = session.sessionId
      const listeners = lexiconListeners.get(key) ?? new Set()
      listeners.add(listener)
      lexiconListeners.set(key, listeners)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) lexiconListeners.delete(key)
      }
    },
    onPick({ candidate }) {
      // Codex: selecting a skill from the unified mention menu inserts `$name`.
      return { text: `$${candidate.name} ` }
    },
  }

  const inputTriggers = ctx.get('inputTriggers') as InputTriggerServiceContract
  ctx.remote.$on('agent-preset/selected', invalidate)
  ctx.on('connection/reset', clearAll)
  ctx.effect(() => {
    const unregister = inputTriggers.registerSource(source)
    return () => {
      unregister()
      clearAll()
    }
  }, 'codex-skill: @skill → $name source')
}
