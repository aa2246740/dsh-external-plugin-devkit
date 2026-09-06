import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readlinkSync, realpathSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'

export type HomeEvidence = 'same' | 'other' | 'unknown'
export type RootEvidence = 'same' | 'other' | 'unknown'

export interface DiscoveredWebHost {
  pid: number
  parentPid: number
  port: number
  launcher: 'source' | 'binary'
  profile: 'web'
  home: HomeEvidence
  root: RootEvidence
  rootPath?: string
  processStartedAt?: string
}

export interface HostDiscovery {
  complete: boolean
  hosts: DiscoveredWebHost[]
  reason?: string
}

interface ProcessCandidate {
  pid: number
  parentPid: number
  port: number
  launcher: 'source' | 'binary'
  profile: 'web'
  rootPath?: string
}

export interface TextProbe {
  ok: boolean
  text: string
  reason?: string
}

interface PathsProbe {
  ok: boolean
  paths: string[]
}

export interface HostDiscoveryDependencies {
  processTable?: () => TextProbe
  openFiles?: (pid: number) => PathsProbe
  processStart?: (pid: number) => TextProbe
}

function canonical(path: string): string {
  return existsSync(path) ? realpathSync(path) : resolve(path)
}

function within(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}${sep}`)
}

function portFrom(command: string): number {
  const match = /(?:^|\s)--port(?:=|\s+)(\d+)(?:\s|$)/.exec(command)
  return match ? Number(match[1]) : 3080
}

function commandWords(command: string): string[] {
  return command.match(/"[^"]*"|'[^']*'|\S+/g)?.map(word => word.replace(/^['"]|['"]$/g, '')) ?? []
}

function isNodeExecutable(word: string | undefined): boolean {
  return word !== undefined && /^node(?:\.exe)?$/.test(basename(word))
}

function webAfter(words: readonly string[], index: number): boolean {
  return index >= 0 && words.slice(index + 1).includes('web')
}

function sourceCliIndex(words: readonly string[], root: string): number {
  const absolute = join(resolve(root), 'apps', 'cli', 'src', 'bin.ts')
  return words.findIndex(word => word === absolute
    || word === 'apps/cli/src/bin.ts'
    || word.replaceAll('\\', '/').endsWith('/apps/cli/src/bin.ts'))
}

function builtCliIndex(words: readonly string[], root: string): number {
  const absolute = join(resolve(root), 'apps', 'cli', 'lib', 'bin.js')
  return words.findIndex(word => word === absolute
    || word === 'apps/cli/lib/bin.js'
    || word.replaceAll('\\', '/').endsWith('/apps/cli/lib/bin.js')
    || word.replaceAll('\\', '/').endsWith('/node_modules/@deepseek-ai/dsh/lib/bin.js'))
}

function publishedCliIndex(words: readonly string[]): number {
  if (['dsh', 'dsh.cmd'].includes(basename(words[0] ?? ''))) return 0
  if (!isNodeExecutable(words[0])) return -1
  return words.length > 1 && ['dsh', 'dsh.cmd'].includes(basename(words[1] ?? '')) ? 1 : -1
}

function rootFromCliWord(word: string | undefined): string | undefined {
  if (!word) return undefined
  const normalized = word.replaceAll('\\', '/')
  const suffixes = ['/apps/cli/src/bin.ts', '/apps/cli/lib/bin.js']
  const suffix = suffixes.find(value => normalized.endsWith(value))
  if (!suffix || !normalized.startsWith('/')) return undefined
  return normalized.slice(0, -suffix.length)
}

/** Parse only Web Host processes, never arbitrary commands that happen to mention a port. */
export function parseWebProcessTable(text: string, root: string): ProcessCandidate[] {
  const out: ProcessCandidate[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line)
    if (!match) continue
    const pid = Number(match[1])
    const parentPid = Number(match[2])
    const command = match[3]!
    const words = commandWords(command)
    const sourceAt = sourceCliIndex(words, root)
    const builtAt = builtCliIndex(words, root)
    const publishedAt = publishedCliIndex(words)
    const source = isNodeExecutable(words[0]) && webAfter(words, sourceAt)
    const binary = !source && ((isNodeExecutable(words[0]) && webAfter(words, builtAt)) || webAfter(words, publishedAt))
    if (!source && !binary) continue
    const cliAt = sourceAt >= 0 ? sourceAt : builtAt
    out.push({
      pid,
      parentPid,
      port: portFrom(command),
      launcher: source ? 'source' : 'binary',
      profile: 'web',
      ...cliAt >= 0 && rootFromCliWord(words[cliAt]) ? { rootPath: rootFromCliWord(words[cliAt]) } : {},
    })
  }
  return out
}

/** Read an OS process birth token. Failure is unknown, never proof of identity. */
export function readProcessStartTime(pid: number): TextProbe {
  const result = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const text = (result.stdout ?? '').trim().replace(/\s+/g, ' ')
  if (result.error || result.status !== 0 || !text) {
    const code = (result.error as NodeJS.ErrnoException | undefined)?.code ?? `exit-${result.status ?? 'unknown'}`
    return { ok: false, text: '', reason: `process start time unavailable for pid ${pid} (${code})` }
  }
  return { ok: true, text }
}

function systemProcessTable(): TextProbe {
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,command='], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error || result.status !== 0) {
    const code = (result.error as NodeJS.ErrnoException | undefined)?.code ?? `exit-${result.status ?? 'unknown'}`
    return { ok: false, text: '', reason: `process table unavailable (${code})` }
  }
  return { ok: true, text: result.stdout }
}

function procOpenFiles(pid: number): PathsProbe | undefined {
  const dir = `/proc/${pid}/fd`
  if (!existsSync(dir)) return undefined
  try {
    const paths = readdirSync(dir).flatMap((entry) => {
      try {
        return [readlinkSync(join(dir, entry))]
      } catch {
        return []
      }
    })
    return { ok: true, paths }
  } catch {
    return { ok: false, paths: [] }
  }
}

function systemOpenFiles(pid: number): PathsProbe {
  const proc = procOpenFiles(pid)
  if (proc?.ok) return proc
  const result = spawnSync('lsof', ['-a', '-p', String(pid), '-Fn'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error || result.status !== 0) return { ok: false, paths: [] }
  return {
    ok: true,
    paths: result.stdout.split(/\r?\n/).filter(line => line.startsWith('n')).map(line => line.slice(1)),
  }
}

function homeEvidence(paths: readonly string[], home: string): HomeEvidence {
  const target = canonical(home)
  if (paths.some(path => within(path, target))) return 'same'
  const profileFile = /[/\\]profiles[/\\](?:web|headless)[/\\](?:cordis(?:\.patch)?\.yml|package\.json|pnpm-lock\.yaml)$/
  return paths.some(path => profileFile.test(path)) ? 'other' : 'unknown'
}

function rootFromObservedPath(path: string): string | undefined {
  const normalized = path.replaceAll('\\', '/')
  for (const suffix of ['/apps/cli/src/bin.ts', '/apps/cli/lib/bin.js']) {
    const at = normalized.indexOf(suffix)
    if (at > 0) return normalized.slice(0, at)
  }
  return undefined
}

function rootEvidence(candidate: ProcessCandidate, paths: readonly string[], root: string): { evidence: RootEvidence; path?: string } {
  const target = canonical(root)
  if (candidate.rootPath) {
    const observed = canonical(candidate.rootPath)
    return { evidence: observed === target ? 'same' : 'other', path: observed }
  }
  const observedRoots = paths.flatMap(path => {
    const observed = rootFromObservedPath(path)
    return observed ? [canonical(observed)] : []
  })
  if (observedRoots.includes(target)) return { evidence: 'same', path: target }
  if (observedRoots.length > 0) return { evidence: 'other', path: observedRoots[0] }
  // lsof includes the cwd entry. Exact equality is useful for relative CLI argv,
  // while profile files merely nested under a test checkout do not prove root.
  if (paths.some(path => canonical(path) === target)) return { evidence: 'same', path: target }
  return { evidence: 'unknown' }
}

/** Discover source or published `dsh web` processes and identify their open profile home. */
export function discoverWebHosts(
  root: string,
  home: string,
  dependencies: HostDiscoveryDependencies = {},
): HostDiscovery {
  const table = (dependencies.processTable ?? systemProcessTable)()
  if (!table.ok) return { complete: false, hosts: [], reason: table.reason ?? 'process table unavailable' }
  const openFiles = dependencies.openFiles ?? systemOpenFiles
  const processStart = dependencies.processStart ?? readProcessStartTime
  const hosts = parseWebProcessTable(table.text, root)
    .filter(candidate => candidate.pid !== process.pid)
    .map(candidate => {
      const observed = openFiles(candidate.pid)
      const rootResult = observed.ok ? rootEvidence(candidate, observed.paths, root) : { evidence: 'unknown' as const }
      const started = processStart(candidate.pid)
      return {
        ...candidate,
        home: observed.ok ? homeEvidence(observed.paths, home) : 'unknown',
        root: rootResult.evidence,
        ...rootResult.path ? { rootPath: rootResult.path } : {},
        ...started.ok ? { processStartedAt: started.text } : {},
      }
    })
  return { complete: true, hosts }
}

function describe(host: DiscoveredWebHost): string {
  return `pid ${host.pid} start=${host.processStartedAt ?? 'unknown'} home=${host.home} root=${host.root} profile=${host.profile} port=${host.port}`
}

/**
 * Guard a Harness installation mutation. A Web Host is affected when it uses
 * either this checkout or this DSH_HOME. Unknown identity is unsafe because it
 * may describe either one.
 */
export function assertNoAffectedWebHosts(
  root: string,
  home: string,
  operation: string,
  dependencies: HostDiscoveryDependencies = {},
): HostDiscovery {
  const discovery = discoverWebHosts(root, home, dependencies)
  if (!discovery.complete) {
    throw new Error(`refusing ${operation}: Web Host discovery is incomplete (${discovery.reason ?? 'unknown'})`)
  }
  const affected = discovery.hosts.filter(host => host.home !== 'other'
    || host.root !== 'other'
    || !host.processStartedAt)
  if (affected.length > 0) {
    throw new Error(`refusing ${operation}: affected or unproved live Web Host(s): ${affected.map(describe).join(', ')}`)
  }
  return discovery
}
