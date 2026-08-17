import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { experimentStatePath, knowledgeDir, observeLogPath, stateDir } from './paths.ts'

export interface ExperimentState {
  id: string
  rubric?: string
  startedAt: string
}

export function readExperiment(repoRoot: string): ExperimentState | undefined {
  const fromEnv = process.env.DSHX_EXPERIMENT?.trim()
  const path = experimentStatePath(repoRoot)
  let file: ExperimentState | undefined
  if (existsSync(path)) {
    try {
      file = JSON.parse(readFileSync(path, 'utf8')) as ExperimentState
    } catch {
      file = undefined
    }
  }
  if (fromEnv) return { id: fromEnv, rubric: file?.rubric, startedAt: file?.startedAt ?? new Date().toISOString() }
  return file
}

export interface OkfDigest {
  generatedAt: string
  files: Record<string, string>
}

function walkMd(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) walkMd(path, acc)
    else if (name.endsWith('.md')) acc.push(path)
  }
  return acc
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function digestBundle(root?: string): OkfDigest {
  const dir = knowledgeDir(root)
  const files: Record<string, string> = {}
  for (const path of walkMd(dir).sort()) {
    files[relative(dir, path).split(sep).join('/')] = sha256File(path)
  }
  return { generatedAt: new Date().toISOString(), files }
}

export function writeBaseline(repoRoot: string): string {
  const dir = stateDir(repoRoot)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'okf-baseline.json')
  writeFileSync(path, `${JSON.stringify(digestBundle(), null, 2)}\n`)
  return path
}

export function logObserve(repoRoot: string, event: Record<string, unknown>): void {
  try {
    const dir = stateDir(repoRoot)
    mkdirSync(dir, { recursive: true })
    const experiment = readExperiment(repoRoot)
    appendFileSync(observeLogPath(repoRoot), `${JSON.stringify({
      ts: new Date().toISOString(),
      ...experiment ? { experiment: experiment.id } : {},
      ...event,
    })}\n`)
  } catch {
    // observation must never break the tool
  }
}
