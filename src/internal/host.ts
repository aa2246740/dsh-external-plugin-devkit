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
    return loadJson<HostState>(path)
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

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function portOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 800)
    await fetch(`http://${host}:${port}/`, { signal: ac.signal })
    clearTimeout(timer)
    return true
  } catch {
    return false
  }
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
}

export function startHost(root: string, spec: StartSpec): HostState {
  const existing = currentHost(root)
  if (existing) {
    throw new Error(`dshx already supervises pid ${existing.pid} on port ${existing.port}. run dshx stop or dshx restart`)
  }
  const logFile = hostLogPath(root, spec.profile)
  ensureDir(dirname(logFile))
  writeText(logFile, '')
  const { cmd, prefix } = dshBin(root)
  const args = [...prefix]
  if (spec.profile === 'web') {
    args.push('web')
    if (spec.overlay) args.push('--patch', spec.overlay)
    args.push('--port', String(spec.port))
  } else {
    args.push('--profile', 'headless')
    if (spec.overlay) args.push('--patch', spec.overlay)
    args.push(...spec.extraArgs ?? [])
  }
  const fd = openSync(logFile, 'a')
  const child = spawn(cmd, args, {
    cwd: root,
    env: dshEnv(root),
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
  }
  writeHostState(root, state)
  writeText(lastHostPath(root), `${JSON.stringify({
    pid: state.pid,
    profile: state.profile,
    port: state.port,
    plugin: state.plugin,
    logFile: state.logFile,
    startedAt: state.startedAt,
  }, null, 2)}\n`)
  return state
}

export function readLastHost(root: string): Pick<HostState, 'profile' | 'port' | 'plugin' | 'logFile'> | undefined {
  const path = lastHostPath(root)
  if (!existsSync(path)) return undefined
  try {
    return loadJson(path)
  } catch {
    return undefined
  }
}

export async function stopHost(root: string, timeoutMs = 8000): Promise<HostState | undefined> {
  const state = readHostState(root)
  if (!state?.pid) return undefined
  if (!pidAlive(state.pid)) {
    writeText(hostStatePath(root), '')
    return state
  }
  try {
    process.kill(state.pid, 'SIGTERM')
  } catch {
    writeText(hostStatePath(root), '')
    return state
  }
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!pidAlive(state.pid)) break
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  if (pidAlive(state.pid)) {
    try {
      process.kill(state.pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }
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
