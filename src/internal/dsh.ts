import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadDotEnv } from './io.ts'
import type { ProfileName } from './types.ts'

export interface DshResult {
  code: number
  stdout: string
  stderr: string
}

export function dshEnv(root: string): NodeJS.ProcessEnv {
  const file = loadDotEnv(join(root, '.env'))
  return { ...process.env, ...file }
}

export function dshBin(root: string): { cmd: string; prefix: string[] } {
  const bin = join(root, 'apps/cli/src/bin.ts')
  if (!existsSync(bin)) throw new Error(`dsh launcher missing: ${bin}`)
  return { cmd: process.execPath, prefix: ['--import', 'tsx/esm', bin] }
}

export function runDsh(root: string, args: readonly string[], timeoutMs = 30_000): DshResult {
  const { cmd, prefix } = dshBin(root)
  const result = spawnSync(cmd, [...prefix, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: dshEnv(root),
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  })
  return {
    code: result.status ?? (result.signal ? 1 : 0),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

export function dumpConfig(root: string, profile: ProfileName, patches: readonly string[] = []): DshResult {
  const args = ['--profile', profile]
  for (const patch of patches) args.push('--patch', patch)
  args.push('--dump-config')
  return runDsh(root, args)
}

export function dumpDefaultConfig(root: string, profile: ProfileName): DshResult {
  return runDsh(root, ['--profile', profile, '--dump-default-config'])
}

export interface DumpEntry {
  id: string
  name?: string
  disabled?: boolean
  source?: string
}

export function parseDumpEntries(yamlText: string): DumpEntry[] {
  const entries: DumpEntry[] = []
  let source: string | undefined
  let current: DumpEntry | undefined
  for (const line of yamlText.split(/\r?\n/)) {
    const comment = /^# ==\s+(.*)$/.exec(line)
    if (comment) {
      source = comment[1]
      continue
    }
    const id = /^- id:\s+(\S+)\s*$/.exec(line)
    if (id) {
      current = { id: id[1]!, source }
      entries.push(current)
      continue
    }
    if (!current) continue
    const name = /^\s+name:\s+(.+)$/.exec(line)
    if (name) current.name = name[1]!.replace(/^['"]|['"]$/g, '')
    if (/^\s+disabled:\s+true\s*$/.test(line)) current.disabled = true
  }
  return entries
}

export function duplicateIds(entries: readonly DumpEntry[]): string[] {
  const counts = new Map<string, number>()
  for (const entry of entries) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1)
  return [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id)
}
