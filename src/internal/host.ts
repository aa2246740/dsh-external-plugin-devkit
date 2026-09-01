import { spawn } from 'node:child_process'
import { closeSync, createReadStream, existsSync, openSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { dshBin, dshEnv } from './dsh.ts'
import { ensureDir, loadJson, writeText } from './io.ts'
import { hostLogPath, hostStatePath, lastHostPath } from './paths.ts'
import type { HostState, ProfileName } from './types.ts'
import { dirname } from 'node:path'

export function readHostState(root: string): HostState | undefined {
  const path = hostStatePath(root)
  if (!existsSync(path)) return undefined
  try {
    const state = loadJson<HostState>(path)
    return {
      ...state,
      overlay: state.overlay ?? '',
      command: state.command ?? [],
      ownership: state.ownership ?? 'spawned',
    }
  } catch {
    return undefined
  }
}

export function writeHostState(root: string, state: HostState): void {
  writeText(hostStatePath(root), `${JSON.stringify(state, null, 2)}\n`)
}

export function clearHostState(root: string): void {
  const path = hostStatePath(root)
  if (existsSync(path)) writeText(path, '')
}

export type ProcessProbe = 'alive' | 'dead' | 'unknown'
export type PortProbe = 'open' | 'closed' | 'unknown'

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const direct = (error as NodeJS.ErrnoException).code
  if (typeof direct === 'string') return direct
  const cause = (error as { cause?: NodeJS.ErrnoException }).cause
  return typeof cause?.code === 'string' ? cause.code : undefined
}

/** Probe a PID without turning a sandbox denial into a false death report. */
export function probePid(pid: number, signal: typeof process.kill = process.kill): ProcessProbe {
  try {
    signal(pid, 0)
    return 'alive'
  } catch (error) {
    return errorCode(error) === 'ESRCH' ? 'dead' : 'unknown'
  }
}

export function pidAlive(pid: number): boolean {
  return probePid(pid) !== 'dead'
}

/** Probe loopback HTTP while preserving denied and timed-out states. */
export async function probePort(
  port: number,
  host = '127.0.0.1',
  request: typeof fetch = fetch,
): Promise<PortProbe> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 800)
  try {
    await request(`http://${host}:${port}/`, { signal: ac.signal })
    return 'open'
  } catch (error) {
    return errorCode(error) === 'ECONNREFUSED' ? 'closed' : 'unknown'
  } finally {
    clearTimeout(timer)
  }
}

export async function portOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return await probePort(port, host) === 'open'
}

export function currentHost(root: string): HostState | undefined {
  const state = readHostState(root)
  if (!state?.pid) return undefined
  if (!pidAlive(state.pid)) return undefined
  return state
}

export interface StartSpec {
  profile: ProfileName
  port: number
  overlay?: string
  plugin?: string
  extraArgs?: string[]
  env?: NodeJS.ProcessEnv
  logFile?: string
}

/** Build only the official dsh arguments for a supervised Host. */
export function dshHostArgs(spec: StartSpec): string[] {
  const args: string[] = []
  if (spec.profile === 'web') {
    // The web subcommand stops launcher-option parsing at the first app-owned
    // flag. Keep --patch before --no-open/--port or RC8 forwards it to the web
    // app, which rejects it as an unknown option.
    args.push('web')
    if (spec.overlay) args.push('--patch', spec.overlay)
    args.push('--no-open', '--port', String(spec.port))
  } else {
    args.push('--profile', 'headless')
    if (spec.overlay) args.push('--patch', spec.overlay)
    args.push(...spec.extraArgs ?? [])
  }
  return args
}

function spawnHost(root: string, spec: StartSpec): HostState {
  const logFile = spec.logFile ?? hostLogPath(root, spec.profile)
  ensureDir(dirname(logFile))
  writeText(logFile, '')
  const { cmd, prefix } = dshBin(root)
  const args = [...prefix, ...dshHostArgs(spec)]
  const fd = openSync(logFile, 'a')
  const child = spawn(cmd, args, {
    cwd: root,
    env: spec.env ?? dshEnv(root),
    detached: true,
    stdio: ['ignore', fd, fd],
  })
  closeSync(fd)
  if (child.pid === undefined) throw new Error('failed to spawn dsh')
  child.unref()
  const state: HostState = {
    pid: child.pid,
    profile: spec.profile,
    port: spec.profile === 'headless' ? 0 : spec.port,
    plugin: spec.plugin,
    overlay: spec.overlay ?? '',
    logFile,
    startedAt: new Date().toISOString(),
    command: [cmd, ...args],
    ownership: 'spawned',
  }
  return state
}

export function startTransientHost(root: string, spec: StartSpec): HostState {
  return spawnHost(root, spec)
}

export function startHost(root: string, spec: StartSpec): HostState {
  const existing = currentHost(root)
  if (existing) {
    throw new Error(`dshx already supervises pid ${existing.pid} on port ${existing.port}. classify the change first; use restart-supervised only when that branch requires it`)
  }
  const state = spawnHost(root, spec)
  writeHostState(root, state)
  writeText(lastHostPath(root), `${JSON.stringify({
    pid: state.pid,
    profile: state.profile,
    port: state.port,
    plugin: state.plugin,
    overlay: state.overlay,
    ownership: state.ownership,
    logFile: state.logFile,
    startedAt: state.startedAt,
  }, null, 2)}\n`)
  return state
}

export function readLastHost(root: string): Pick<HostState, 'profile' | 'port' | 'plugin' | 'overlay' | 'ownership' | 'logFile'> | undefined {
  const path = lastHostPath(root)
  if (!existsSync(path)) return undefined
  try {
    const state = loadJson<Pick<HostState, 'profile' | 'port' | 'plugin' | 'overlay' | 'ownership' | 'logFile'>>(path)
    return { ...state, overlay: state.overlay ?? '', ownership: state.ownership ?? 'spawned' }
  } catch {
    return undefined
  }
}

async function stopPid(pid: number, timeoutMs: number): Promise<void> {
  const initial = probePid(pid)
  if (initial === 'dead') return
  if (initial === 'unknown') throw new Error(`cannot verify pid ${pid}: process access denied; refusing to clear or signal it`)
  try {
    process.kill(pid, 'SIGTERM')
  } catch (error) {
    if (errorCode(error) === 'ESRCH') return
    throw new Error(`cannot signal pid ${pid}: ${errorCode(error) ?? 'unknown process error'}`)
  }
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (probePid(pid) === 'dead') return
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  const afterTerm = probePid(pid)
  if (afterTerm === 'unknown') throw new Error(`cannot verify pid ${pid} after SIGTERM; refusing SIGKILL`)
  if (afterTerm === 'alive') {
    try {
      process.kill(pid, 'SIGKILL')
    } catch (error) {
      if (errorCode(error) !== 'ESRCH') throw new Error(`cannot kill pid ${pid}: ${errorCode(error) ?? 'unknown process error'}`)
    }
  }
}

export async function stopTransientHost(state: HostState, timeoutMs = 8000): Promise<void> {
  await stopPid(state.pid, timeoutMs)
}

export async function stopHost(root: string, timeoutMs = 8000): Promise<HostState | undefined> {
  const state = readHostState(root)
  if (!state?.pid) return undefined
  await stopPid(state.pid, timeoutMs)
  writeText(hostStatePath(root), '')
  return state
}

export function readLogTail(logFile: string, maxLines = 80): string {
  if (!existsSync(logFile)) return ''
  const lines = readFileSync(logFile, 'utf8').split(/\r?\n/)
  return lines.slice(-maxLines).join('\n')
}

export function logContains(logFile: string, marker: string): boolean {
  if (!existsSync(logFile)) return false
  return readFileSync(logFile, 'utf8').includes(marker)
}

export async function waitForLog(logFile: string, marker: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (logContains(logFile, marker)) return true
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  return logContains(logFile, marker)
}

export async function waitForHttp(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await portOpen(port)) return true
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return portOpen(port)
}

export async function followLog(logFile: string, grep?: string): Promise<void> {
  if (!existsSync(logFile)) throw new Error(`log missing: ${logFile}`)
  const rl = createInterface({ input: createReadStream(logFile, { encoding: 'utf8' }) })
  for await (const line of rl) {
    if (grep && !line.includes(grep)) continue
    process.stdout.write(`${line}\n`)
  }
}
