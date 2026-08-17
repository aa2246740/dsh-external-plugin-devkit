import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export function dshxPackageRoot(): string {
  return resolve(here, '../..')
}

export function findRepoRoot(start = process.cwd()): string {
  let dir = resolve(start)
  for (;;) {
    const launcher = join(dir, 'apps/cli/src/bin.ts')
    const dshxCli = join(dir, 'tools/dshx/src/cli.ts')
    if (existsSync(launcher) && existsSync(dshxCli)) return dir
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(
        'cannot find a DeepSeek Harness checkout (looked for apps/cli/src/bin.ts and tools/dshx/src/cli.ts). Put this repo at <harness>/tools/dshx',
      )
    }
    dir = parent
  }
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

export function resolveDshHome(): string {
  const fromEnv = process.env.DSH_HOME?.trim()
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

export function experimentsDir(): string {
  return join(dshxPackageRoot(), 'experiments')
}
