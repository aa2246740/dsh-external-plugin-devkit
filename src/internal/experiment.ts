import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { experimentsDir, observeLogPath } from './paths.ts'

export interface ExperimentRubric {
  id: string
  title: string
  require: {
    kb?: boolean
    searchAny?: string[]
    catAny?: string[]
    catAll?: string[]
    catGroups?: string[][]
    commands?: string[]
    searchThenCat?: boolean
  }
}

export interface ObserveEvent {
  ts?: string
  experiment?: string
  kind?: string
  command?: string
  op?: string
  query?: string
  id?: string
  target?: string
  hits?: string[]
  [key: string]: unknown
}

export interface ScoreCheck {
  code: string
  ok: boolean
  message: string
}

export interface ExperimentScore {
  experiment: string
  rubric: string
  ok: boolean
  passed: number
  total: number
  checks: ScoreCheck[]
  cats: string[]
  searches: string[]
  commands: string[]
}

export function loadRubric(id: string): ExperimentRubric {
  const path = join(experimentsDir(), `${id}.json`)
  if (!existsSync(path)) {
    const known = existsSync(experimentsDir())
      ? readdirSync(experimentsDir()).filter(name => name.endsWith('.json')).map(name => name.replace(/\.json$/, ''))
      : []
    throw new Error(`unknown rubric: ${id}${known.length ? ` (have ${known.join(', ')})` : ''}`)
  }
  return JSON.parse(readFileSync(path, 'utf8')) as ExperimentRubric
}

export function listRubrics(): string[] {
  if (!existsSync(experimentsDir())) return []
  return readdirSync(experimentsDir()).filter(name => name.endsWith('.json')).map(name => name.replace(/\.json$/, '')).sort()
}

export function readObserve(repoRoot: string): ObserveEvent[] {
  const path = observeLogPath(repoRoot)
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8').split(/\n/).filter(Boolean).map(line => {
    try {
      return JSON.parse(line) as ObserveEvent
    } catch {
      return { kind: 'parse-error' }
    }
  })
}

export function eventsFor(repoRoot: string, experiment: string): ObserveEvent[] {
  return readObserve(repoRoot).filter(event => event.experiment === experiment)
}

function includesFold(hay: string, needle: string): boolean {
  return hay.toLowerCase().includes(needle.toLowerCase())
}

export function scoreEvents(events: ObserveEvent[], experiment: string, rubric: ExperimentRubric): ExperimentScore {
  const commands = events.filter(event => event.kind === 'cli' && typeof event.command === 'string').map(event => event.command!)
  const searches = events.filter(event => event.kind === 'kb' && event.op === 'search' && typeof event.query === 'string').map(event => event.query!)
  const cats = events.filter(event => event.kind === 'kb' && event.op === 'cat' && typeof event.id === 'string').map(event => event.id!)
  const kbOps = events.filter(event => event.kind === 'kb')
  const checks: ScoreCheck[] = []

  if (rubric.require.kb) {
    const ok = commands.includes('kb') || kbOps.length > 0
    checks.push({ code: 'kb', ok, message: ok ? 'opened the knowledge bundle' : 'never ran dshx kb / kb cat / kb search' })
  }

  if (rubric.require.searchAny?.length) {
    const ok = rubric.require.searchAny.some(needle => searches.some(query => includesFold(query, needle)))
    checks.push({
      code: 'search',
      ok,
      message: ok
        ? `searched (${searches.join(' | ') || 'none'})`
        : `no search matched ${JSON.stringify(rubric.require.searchAny)}`,
    })
  }

  if (rubric.require.catAny?.length) {
    const ok = rubric.require.catAny.some(id => cats.includes(id))
    checks.push({
      code: 'cat-any',
      ok,
      message: ok
        ? `cat ${cats.filter(id => rubric.require.catAny!.includes(id)).join(', ')}`
        : `never catted any of ${rubric.require.catAny.join(', ')} (cats: ${cats.join(', ') || 'none'})`,
    })
  }

  if (rubric.require.catGroups?.length) {
    for (const [index, group] of rubric.require.catGroups.entries()) {
      const hit = group.filter(id => cats.includes(id))
      checks.push({
        code: `cat-group-${index + 1}`,
        ok: hit.length > 0,
        message: hit.length > 0
          ? `group ${index + 1}: cat ${hit.join(', ')}`
          : `group ${index + 1}: never catted any of ${group.join(', ')}`,
      })
    }
  }

  if (rubric.require.catAll?.length) {
    const missing = rubric.require.catAll.filter(id => !cats.includes(id))
    checks.push({
      code: 'cat-all',
      ok: missing.length === 0,
      message: missing.length === 0 ? `cat all required` : `missed cat ${missing.join(', ')}`,
    })
  }

  if (rubric.require.commands?.length) {
    const missing = rubric.require.commands.filter(name => !commands.includes(name))
    checks.push({
      code: 'commands',
      ok: missing.length === 0,
      message: missing.length === 0 ? `ran ${rubric.require.commands.join(', ')}` : `never ran ${missing.join(', ')}`,
    })
  }

  if (rubric.require.searchThenCat) {
    const searchIdx = events.findIndex(event => event.kind === 'kb' && event.op === 'search')
    const catAfter = searchIdx >= 0 && events.slice(searchIdx + 1).some(event => event.kind === 'kb' && event.op === 'cat')
    const ok = searchIdx < 0 ? cats.length > 0 : catAfter
    checks.push({
      code: 'walk',
      ok,
      message: ok
        ? (searchIdx < 0 ? 'catted without search (graph walk is fine)' : 'catted after search')
        : 'searched but never catted — snippets are not the contract',
    })
  }

  const passed = checks.filter(check => check.ok).length
  return {
    experiment,
    rubric: rubric.id,
    ok: checks.length > 0 && checks.every(check => check.ok),
    passed,
    total: checks.length,
    checks,
    cats,
    searches,
    commands: [...new Set(commands)],
  }
}

export function scoreExperiment(repoRoot: string, experiment: string, rubric: ExperimentRubric): ExperimentScore {
  return scoreEvents(eventsFor(repoRoot, experiment), experiment, rubric)
}
