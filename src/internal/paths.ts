import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export type HarnessSource = 'flag' | 'env' | 'config' | 'walk'

export interface HarnessHit {
  root: string
  source: HarnessSource
}

export interface HarnessResolve {
  ok: boolean
  root?: string
  source?: HarnessSource
  candidates: HarnessHit[]
  message?: string
}

export function dshxPackageRoot(): string {
  return resolve(here, '../..')
}

export function userConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME?.trim()
  if (xdg) return join(xdg, 'dshx')
  return join(homedir(), '.config', 'dshx')
}

export function userHarnessConfigPath(): string {
  return join(userConfigDir(), 'harness')
}

export function skillPackageDir(): string {
  return join(dshxPackageRoot(), 'skill', 'dshx')
}

export function isHarnessCheckout(dir: string, requireDshx = true): boolean {
  if (!existsSync(join(dir, 'apps/cli/src/bin.ts'))) return false
  if (!requireDshx) return true
  return existsSync(join(dir, 'tools/dshx/src/cli.ts'))
}

export function walkToHarness(start: string, requireDshx = true): string | undefined {
  let dir = resolve(start)
  for (;;) {
    if (isHarnessCheckout(dir, requireDshx)) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

export function readHarnessConfig(): string | undefined {
  const path = userHarnessConfigPath()
  if (!existsSync(path)) return undefined
  const text = readFileSync(path, 'utf8').trim()
  return text.length > 0 ? resolve(text) : undefined
}

export function writeHarnessConfig(root: string): string {
  const path = userHarnessConfigPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${resolve(root)}\n`)
  return path
}

function pushUnique(hits: HarnessHit[], hit: HarnessHit): void {
  const root = resolve(hit.root)
  if (hits.some(item => item.root === root)) return
  hits.push({ root, source: hit.source })
}

export function resolveHarness(options: {
  start?: string
  flag?: string
  requireDshx?: boolean
} = {}): HarnessResolve {
  const requireDshx = options.requireDshx ?? true
  const start = options.start ?? process.cwd()
  const candidates: HarnessHit[] = []

  if (options.flag?.trim()) {
    const flagged = resolve(options.flag.trim())
    if (!isHarnessCheckout(flagged, requireDshx)) {
      return {
        ok: false,
        candidates,
        message: `--harness is not a DeepSeek Harness checkout${requireDshx ? ' with tools/dshx' : ''}: ${flagged}`,
      }
    }
    return { ok: true, root: flagged, source: 'flag', candidates: [{ root: flagged, source: 'flag' }] }
  }

  const fromEnv = process.env.DSHX_HARNESS?.trim()
  if (fromEnv) {
    const envRoot = resolve(fromEnv)
    if (!isHarnessCheckout(envRoot, requireDshx)) {
      return {
        ok: false,
        candidates,
        message: `DSHX_HARNESS is set but is not a DeepSeek Harness checkout${requireDshx ? ' with tools/dshx' : ''}: ${envRoot}`,
      }
    }
    pushUnique(candidates, { root: envRoot, source: 'env' })
  }

  const fromConfig = readHarnessConfig()
  if (fromConfig) {
    if (!isHarnessCheckout(fromConfig, requireDshx)) {
      return {
        ok: false,
        candidates,
        message: `${userHarnessConfigPath()} points at a path that is not a DeepSeek Harness checkout${requireDshx ? ' with tools/dshx' : ''}: ${fromConfig}`,
      }
    }
    pushUnique(candidates, { root: fromConfig, source: 'config' })
  }

  const walked = walkToHarness(start, requireDshx)
  if (walked) pushUnique(candidates, { root: walked, source: 'walk' })

  if (candidates.length === 0) {
    return {
      ok: false,
      candidates,
      message: requireDshx
        ? 'cannot find a DeepSeek Harness checkout (looked for apps/cli/src/bin.ts and tools/dshx/src/cli.ts). Set DSHX_HARNESS, pass --harness, write ~/.config/dshx/harness, or put this repo at <harness>/tools/dshx'
        : 'cannot find a DeepSeek Harness checkout (looked for apps/cli/src/bin.ts). Pass --harness or cd into the checkout',
    }
  }
  if (candidates.length > 1) {
    const listed = candidates.map(item => `${item.source}: ${item.root}`).join('; ')
    return {
      ok: false,
      candidates,
      message: `multiple DeepSeek Harness checkouts found (${listed}). Pass --harness <path> or set DSHX_HARNESS; do not guess`,
    }
  }
  const [only] = candidates
  return { ok: true, root: only!.root, source: only!.source, candidates }
}

export function findRepoRoot(start = process.cwd(), flag?: string): string {
  const resolved = resolveHarness({ start, flag, requireDshx: true })
  if (!resolved.ok || !resolved.root) {
    throw new Error(resolved.message ?? 'cannot find a DeepSeek Harness checkout')
  }
  return resolved.root
}

export function stateDir(root: string): string {
  return join(root, '.dshx')
}

export function knowledgeDir(root?: string): string {
  return join(root ?? dshxPackageRoot(), 'knowledge')
}

export function pluginsDir(root: string): string {
  return join(root, 'my-plugins')
}

export function resolveDshHome(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.DSH_HOME?.trim()
  if (fromEnv) return resolve(fromEnv)
  return join(homedir(), '.dsh')
}

export function profileDir(home: string, profile: string): string {
  return join(home, 'profiles', profile)
}

export function sessionsRoot(home: string): string {
  return join(home, 'sessions')
}

export function hostStatePath(root: string): string {
  return join(stateDir(root), 'host.json')
}

export function lastHostPath(root: string): string {
  return join(stateDir(root), 'last-host.json')
}

export function overlayPath(root: string, id: string): string {
  return join(stateDir(root), 'overlays', `${id}.yml`)
}

export function hostLogPath(root: string, profile: string): string {
  return join(stateDir(root), 'logs', `${profile}.log`)
}

export function observeLogPath(root: string): string {
  return join(stateDir(root), 'observe.jsonl')
}

export function experimentStatePath(root: string): string {
  return join(stateDir(root), 'experiment.json')
}

export function creatorStateDir(root: string): string {
  return join(stateDir(root), 'creator-plus')
}

export function creatorClaimsPath(root: string): string {
  return join(creatorStateDir(root), 'claims.json')
}

export function creatorClaimsLockPath(root: string): string {
  return join(creatorStateDir(root), 'claims.lock')
}

export function creatorActiveTransactionPath(root: string): string {
  return join(creatorStateDir(root), 'active-transaction.json')
}

export function creatorTransactionsDir(root: string): string {
  return join(creatorStateDir(root), 'transactions')
}

export function creatorActivationLockPath(root: string): string {
  return join(creatorStateDir(root), 'activation.lock')
}

export function creatorQuarantinesPath(root: string): string {
  return join(creatorStateDir(root), 'quarantines.json')
}

export function creatorIncidentsPath(root: string): string {
  return join(creatorStateDir(root), 'incidents.json')
}

export function creatorIncidentsLockPath(root: string): string {
  return join(creatorStateDir(root), 'incidents.lock')
}

export function guardianControlPath(root: string): string {
  return join(creatorStateDir(root), 'guardian-control.json')
}

export function guardianStatePath(root: string): string {
  return join(creatorStateDir(root), 'guardian-state.json')
}

export function guardianStartLockPath(root: string): string {
  return join(creatorStateDir(root), 'guardian-start.lock')
}

export function guardianControlLockPath(root: string): string {
  return join(creatorStateDir(root), 'guardian-control.lock')
}

export function guardianLogPath(root: string): string {
  return join(creatorStateDir(root), 'guardian.log')
}

export function experimentsDir(): string {
  return join(dshxPackageRoot(), 'experiments')
}
