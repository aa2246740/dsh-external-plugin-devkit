import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readlinkSync, realpathSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'

export type HomeEvidence = 'same' | 'other' | 'unknown'

export interface DiscoveredWebHost {
  pid: number
  parentPid: number
  port: number
  launcher: 'source' | 'binary'
  home: HomeEvidence
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
}

interface TextProbe {
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
    out.push({ pid, parentPid, port: portFrom(command), launcher: source ? 'source' : 'binary' })
  }
  return out
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

/** Discover source or published `dsh web` processes and identify their open profile home. */
export function discoverWebHosts(
  root: string,
  home: string,
  dependencies: HostDiscoveryDependencies = {},
): HostDiscovery {
  const table = (dependencies.processTable ?? systemProcessTable)()
  if (!table.ok) return { complete: false, hosts: [], reason: table.reason ?? 'process table unavailable' }
  const openFiles = dependencies.openFiles ?? systemOpenFiles
  const hosts = parseWebProcessTable(table.text, root)
    .filter(candidate => candidate.pid !== process.pid)
    .map(candidate => ({
      ...candidate,
      home: (() => {
        const observed = openFiles(candidate.pid)
        return observed.ok ? homeEvidence(observed.paths, home) : 'unknown'
      })(),
    }))
  return { complete: true, hosts }
}
