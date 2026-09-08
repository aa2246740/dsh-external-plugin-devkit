/** Browser-neutral, private handoff. This module never starts or stops a Host. */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { Stats } from 'node:fs'
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { dshEnv } from './dsh.ts'
import { discoverWebHosts } from './host-discovery.ts'
import { currentHost } from './host.ts'
import { resolveDshHome } from './paths.ts'
import { findWebStartupUrl, parseWebBootManifest } from './web-boot.ts'
import { createWebProofRequest, validateWebStartupUrl } from './web-proof-auth.ts'

export interface BrowserHostIdentity { home: string; root: string; pid: number; processStartedAt: string; port: number }
export interface BrowserBinding { version: 1; host: BrowserHostIdentity; source: 'launcher' | 'creator'; expiresAt: number; startupUrl: string }
const BINDING_TTL = 8 * 60 * 60 * 1000
const MAX_BYTES = 16 * 1024

export function discoverBrowserHost(root: string): BrowserHostIdentity {
  const home = realpathSync(resolveDshHome(dshEnv(root)))
  const discovery = discoverWebHosts(root, home)
  if (!discovery.complete) throw new Error('WEB_HOST_UNKNOWN: process discovery unavailable')
  if (discovery.hosts.some(host => host.home === 'unknown' || host.root === 'unknown' || !host.processStartedAt)) {
    throw new Error('WEB_HOST_UNKNOWN: an observed Host has incomplete identity')
  }
  const hosts = discovery.hosts.filter(host => host.home === 'same')
  if (hosts.length !== 1) throw new Error(hosts.length ? 'WEB_HOST_COLLISION: multiple same-Home Hosts' : 'WEB_HOST_MISSING: no same-Home Web Host')
  const host = hosts[0]!
  if (host.root !== 'same' || !host.rootPath) throw new Error('WEB_HOST_ROOT_MISMATCH: select the running Host checkout')
  return { home, root: realpathSync(host.rootPath), pid: host.pid, processStartedAt: host.processStartedAt!, port: host.port }
}

export function sameBrowserHost(a: BrowserHostIdentity, b: BrowserHostIdentity): boolean {
  return a.home === b.home && a.root === b.root && a.pid === b.pid && a.processStartedAt === b.processStartedAt && a.port === b.port
}
export function assertSameBrowserHost(a: BrowserHostIdentity, b: BrowserHostIdentity): void {
  if (!sameBrowserHost(a, b)) throw new Error('WEB_HOST_CHANGED: discard the old browser handoff and bind the current Host')
}

function privateStat(stat: Stats, directory: boolean): void {
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())
    || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) {
    throw new Error('WEB_HANDOFF_PERMISSIONS: require an owner-only non-symlink handoff')
  }
}
function bindingPath(home: string, create: boolean): string {
  // Home is canonicalized by discovery. Never traverse project-controlled paths.
  const directory = join(home, '.dshx-browser')
  if (create) mkdirSync(directory, { mode: 0o700 })
  privateStat(lstatSync(directory), true)
  return join(directory, 'access.json')
}
function isMissing(error: unknown): boolean { return (error as NodeJS.ErrnoException)?.code === 'ENOENT' }

export function writeBrowserBinding(binding: BrowserBinding): void {
  let path: string
  try { path = bindingPath(binding.host.home, true) }
  catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error
    path = bindingPath(binding.host.home, false)
  }
  try { privateStat(lstatSync(path), false) } catch (error) { if (!isMissing(error)) throw error }
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, JSON.stringify(binding), { mode: 0o600, flag: 'wx' })
    renameSync(temporary, path)
  } finally { try { unlinkSync(temporary) } catch (error) { if (!isMissing(error)) throw error } }
}

export function readBrowserBinding(host: BrowserHostIdentity, now = Date.now()): BrowserBinding | undefined {
  let fd: number | undefined
  try {
    const path = bindingPath(host.home, false)
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const stat = fstatSync(fd)
    privateStat(stat, false)
    if (stat.size > MAX_BYTES) throw new Error('WEB_HANDOFF_INVALID: handoff exceeds size limit')
    let value: BrowserBinding
    try { value = JSON.parse(readFileSync(fd, 'utf8')) } catch { throw new Error('WEB_HANDOFF_INVALID: invalid handoff record') }
    if (value?.version !== 1 || !value.host || typeof value.startupUrl !== 'string'
      || !['creator', 'launcher'].includes(value.source) || !Number.isFinite(value.expiresAt)
      || value.expiresAt > now + BINDING_TTL) throw new Error('WEB_HANDOFF_INVALID: unsupported handoff record')
    assertSameBrowserHost(value.host, host)
    if (value.expiresAt <= now) throw new Error('WEB_HANDOFF_EXPIRED: refresh the Creator bridge or bind the launcher again')
    validateWebStartupUrl(value.startupUrl, host.port)
    return value
  } catch (error) { if (isMissing(error)) return undefined; throw error }
  finally { if (fd !== undefined) closeSync(fd) }
}

export async function proveBrowserAccess(host: BrowserHostIdentity, startup: string | undefined, timeoutMs: number): Promise<void> {
  const request = createWebProofRequest(host.port, startup ?? '', timeoutMs)
  const response = await request('/')
  if (!response.ok || !parseWebBootManifest(await response.text())) {
    throw new Error('WEB_HOST_INVALID_PAGE: authenticated endpoint is not an official DSH Web boot page')
  }
}

export async function bindBrowserAccess(root: string, startup: string, source: BrowserBinding['source'], timeoutMs = 10_000,
  discover = discoverBrowserHost): Promise<{ host: BrowserHostIdentity; source: string; expiresAt: number }> {
  const host = discover(root)
  const url = validateWebStartupUrl(startup, host.port)
  await proveBrowserAccess(host, url.href, timeoutMs)
  assertSameBrowserHost(host, discover(root))
  const binding: BrowserBinding = { version: 1, host, source, expiresAt: Date.now() + BINDING_TTL, startupUrl: url.href }
  writeBrowserBinding(binding)
  return { host, source, expiresAt: binding.expiresAt }
}

/** Credentials come from an explicit private input, our registry, or our own proven launcher. */
export function browserStartup(root: string, host: BrowserHostIdentity, supplied = process.env.DSHX_WEB_STARTUP_URL): { startup?: string; source: string } {
  if (supplied) return { startup: validateWebStartupUrl(supplied, host.port).href, source: 'private-launcher-input' }
  const binding = readBrowserBinding(host)
  if (binding) return { startup: binding.startupUrl, source: binding.source }
  const state = currentHost(root)
  if (state?.ownership === 'spawned' && state.pid === host.pid && state.processStartedAt === host.processStartedAt
    && state.home === host.home && state.hostRoot === host.root && state.port === host.port) {
    const stat = lstatSync(state.logFile)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new Error('WEB_LAUNCHER_OUTPUT_UNAVAILABLE')
    const url = findWebStartupUrl(readFileSync(state.logFile, 'utf8'), host.port)
    if (url) return { startup: validateWebStartupUrl(url, host.port).href, source: 'dshx-owned-launcher' }
  }
  return { source: 'none' }
}

/** The adapter is an explicitly configured executable, not a model-controlled shell string. */
export async function openBrowserAdapter(executable: string | undefined, host: BrowserHostIdentity, startup: string | undefined,
  timeoutMs: number, signal?: AbortSignal): Promise<{ status: 'BROWSER_AUTHENTICATED'; origin: string }> {
  if (!executable) throw new Error('BROWSER_ADAPTER_REQUIRED: configure an adapter for this agent\'s permitted browser runtime')
  if (!isAbsolute(executable)) throw new Error('BROWSER_ADAPTER_INVALID: configure an absolute executable path')
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) throw new Error('BROWSER_ADAPTER_INVALID_TIMEOUT')
  const origin = `http://127.0.0.1:${host.port}`
  if (startup) validateWebStartupUrl(startup, host.port)
  if (signal?.aborted) throw new Error('BROWSER_ADAPTER_CANCELLED')
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete env.DSHX_WEB_STARTUP_URL
    delete env.DSHX_CREATOR_CONTEXT
    delete env.NODE_TEST_CONTEXT // adapters are standalone processes, not Node test-runner workers
    const child = spawn(executable, [], { env, stdio: ['pipe', 'pipe', 'pipe'], shell: false })
    let stdout = ''; let bytes = 0; let finished = false
    const finish = (error?: Error, value?: { status: 'BROWSER_AUTHENTICATED'; origin: string }) => {
      if (finished) return
      finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort)
      if (error) { child.kill(); reject(error) } else resolve(value!)
    }
    const abort = () => finish(new Error('BROWSER_ADAPTER_CANCELLED'))
    const timer = setTimeout(() => finish(new Error('BROWSER_ADAPTER_TIMEOUT')), timeoutMs)
    signal?.addEventListener('abort', abort, { once: true })
    child.on('error', () => finish(new Error('BROWSER_ADAPTER_UNAVAILABLE')))
    child.stdin.on('error', () => finish(new Error('BROWSER_ADAPTER_INPUT_FAILED')))
    child.stdout.on('data', chunk => {
      bytes += chunk.length
      if (bytes > MAX_BYTES) return finish(new Error('BROWSER_ADAPTER_INVALID_RECEIPT'))
      stdout += chunk.toString('utf8')
    })
    // Never echo browser stderr, navigation URLs, or adapter output containing credentials.
    child.stderr.resume()
    child.on('close', code => {
      if (code !== 0) return finish(new Error('BROWSER_ADAPTER_FAILED: browser access failed; authentication proof alone is insufficient'))
      try {
        const receipt = JSON.parse(stdout)
        if (receipt.status !== 'BROWSER_AUTHENTICATED' || receipt.origin !== origin) throw new Error()
        finish(undefined, { status: 'BROWSER_AUTHENTICATED', origin })
      } catch { finish(new Error('BROWSER_ADAPTER_INVALID_RECEIPT')) }
    })
    child.stdin.end(JSON.stringify({ version: 1, host, origin, startupUrl: startup ?? `${origin}/`, timeoutMs }))
  })
}
