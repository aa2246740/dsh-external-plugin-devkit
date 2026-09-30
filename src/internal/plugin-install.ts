import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { discoverWebHosts, type DiscoveredWebHost, type HostDiscovery } from './host-discovery.ts'
import { profileDir, resolveDshHome } from './paths.ts'
import { createWebProofRequest } from './web-proof-auth.ts'
import { clientEntryFindings } from './file-copy.ts'
import { browserStartup } from './browser-access.ts'
import type { ProfileName } from './types.ts'
// @ts-ignore -- portable JS boundary is shared with the Host bridge.
import { assertPluginSource } from '../core-boundary.js'

interface LocalBundle {
  name: string
  version: string
  dir: string
  spec: string
}

interface BundleRow { name: string; enabled: boolean; error?: unknown }
interface InstallChange {
  application: 'applied' | 'restart-required' | 'overridden' | 'failed' | 'cancelled'
  bundle?: string
  error?: { code?: string }
  packageResult?: { exitCode: number; logPath?: string; kind?: string }
  pendingBuilds?: string[]
}

const METHODS = new Set(['inspect', 'installBundle', 'listBundles', 'waitForInstall'])

/** An external operator calls the same authenticated public Remote as the official plugin page. */
export function pluginManagerRemote(port: number, timeoutMs: number, request = createWebProofRequest(port, undefined, timeoutMs)) {
  return async (method: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    if (!METHODS.has(method)) throw new Error('PLUGIN_REMOTE_METHOD_NOT_ALLOWED')
    const rpcId = randomUUID()
    const endpoint = `pluginManager/${method}`
    const response = await request(`http://127.0.0.1:${port}/api/${endpoint}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload: { args } }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error(`PLUGIN_REMOTE_HTTP_${response.status}`)
    const envelope = await response.json() as { type?: string; rpcId?: string; result?: { ok?: boolean; value?: unknown; error?: { code?: string } } }
    if (envelope.type !== 'server-response' || envelope.rpcId !== rpcId || typeof envelope.result?.ok !== 'boolean') {
      throw new Error('PLUGIN_REMOTE_INVALID_RESPONSE')
    }
    if (!envelope.result.ok) throw new Error(`PLUGIN_REMOTE_REFUSED: ${envelope.result.error?.code ?? 'unknown'}`)
    return envelope.result.value
  }
}

/** Inspect a built local bundle. Development-only watched plugins keep their Creator+ route. */
export function localBundle(raw: string): LocalBundle {
  const dir = realpathSync(resolve(raw.replace(/^(?:link|file):/, '')))
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    name?: string; version?: string; dsh?: { bundle?: { patch?: unknown }; client?: unknown }
  }
  if (!pkg.name || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(pkg.name) || !pkg.version) {
    throw new Error('LOCAL_PACKAGE_INVALID: package.json needs a package name and version')
  }
  if (pkg.dsh?.bundle?.patch === undefined) {
    throw new Error('LOCAL_BUNDLE_REQUIRED: the official installer needs dsh.bundle.patch. A plain dshx development plugin uses the Creator+ fixed activate-new-client tool (or the external Web watched-plugin command). Do not publish to npm or mount it twice to work around this.')
  }
  const errors = clientEntryFindings(dir).filter(item => item.level === 'error')
  if (errors.length) throw new Error(`LOCAL_CLIENT_NOT_BUILT: ${errors.map(item => item.message).join('; ')}`)
  return { name: pkg.name, version: pkg.version, dir, spec: `link:${dir}` }
}

/** Select exactly one same-Home Host and preserve unknown process identity as a blocker. */
export function installationHost(discovery: HostDiscovery, profile: ProfileName, port: number): DiscoveredWebHost {
  if (!discovery.complete || discovery.hosts.some(host => host.home === 'unknown')) {
    throw new Error('HOST_IDENTITY_UNPROVEN: process visibility and the selected DSH_HOME must be established')
  }
  const sameHome = discovery.hosts.filter(host => host.home === 'same')
  if (sameHome.length !== 1) throw new Error(`SINGLE_HOME_HOST_REQUIRED: found ${sameHome.length} same-Home Hosts`)
  const host = sameHome[0]!
  if (host.profile !== profile || host.port !== port || !host.processStartedAt) {
    throw new Error(`HOST_TARGET_MISMATCH: current Host is profile ${host.profile} on port ${host.port}; use that exact profile and port`)
  }
  return host
}

export interface PluginInstallDependencies {
  discover?: () => HostDiscovery
  remote?: ReturnType<typeof pluginManagerRemote>
  home?: string
}

/** Install one local bundle through the owning Host; never mutate Desktop via a private Creator ticket. */
export async function installLocalBundle(root: string, raw: string, profile: ProfileName, port: number, timeoutMs: number, deps: PluginInstallDependencies = {}) {
  if (process.env.DSH_SHELL || process.env.DSHX_CREATOR_CONTEXT) throw new Error('EXTERNAL_SUPERVISOR_REQUIRED: use the Creator+ fixed tools inside DSH')
  if (profile !== 'web' && profile !== 'desktop') throw new Error('LOCAL_INSTALL_PROFILE_REQUIRED: select the running Web or Desktop profile')
  const bundle = localBundle(raw)
  assertPluginSource(root, bundle.dir)
  const home = deps.home ?? resolveDshHome()
  const discover = deps.discover ?? (() => discoverWebHosts(root, home))
  const before = installationHost(discover(), profile, port)
  const sameHost = () => {
    const current = installationHost(discover(), profile, port)
    if (current.pid !== before.pid || current.processStartedAt !== before.processStartedAt) throw new Error('HOST_CHANGED_DURING_INSTALL: inspect saved profile state before retrying')
  }
  const startup = deps.remote ? undefined : browserStartup(root, {
    home: realpathSync(home), root: before.rootPath ?? root, pid: before.pid,
    processStartedAt: before.processStartedAt!, port,
  }).startup
  const remote = deps.remote ?? pluginManagerRemote(port, timeoutMs, createWebProofRequest(port, startup, timeoutMs))
  const inspected = await remote('inspect', { spec: bundle.spec }) as { status?: string; problem?: string; name?: string; version?: string; bundle?: boolean }
  if (inspected.status !== 'accepted' || inspected.name !== bundle.name || inspected.version !== bundle.version || inspected.bundle !== true) {
    throw new Error(`PLUGIN_INSPECTION_REFUSED: ${inspected.problem ?? 'local package identity changed'}`)
  }
  sameHost()
  const refreshed = localBundle(raw)
  if (refreshed.dir !== bundle.dir || refreshed.name !== bundle.name || refreshed.version !== bundle.version) {
    throw new Error('LOCAL_PACKAGE_CHANGED: inspect the local package before retrying')
  }
  const requestId = randomUUID()
  let change: InstallChange
  try {
    change = await remote('installBundle', { spec: bundle.spec, options: { enabled: true, requestId } }) as InstallChange
  } catch {
    // Join the exact existing request once. Never issue another install after an uncertain response.
    const recovered = await remote('waitForInstall', { requestId }).catch(() => undefined)
    if (!recovered) throw new Error(`INSTALL_OUTCOME_UNCONFIRMED: request ${requestId}; inspect the official plugin page before retrying`)
    change = recovered as InstallChange
  }
  sameHost()
  if (!change || !['applied', 'restart-required', 'overridden', 'failed', 'cancelled'].includes(change.application)) {
    throw new Error('PLUGIN_INSTALL_INVALID_RESULT: inspect the official plugin page before retrying')
  }
  if (change.application !== 'applied' || change.error || (change.packageResult && change.packageResult.exitCode !== 0)) {
    const pending = change.pendingBuilds?.length ? `; pending scripts: ${change.pendingBuilds.join(', ')}; approve only after reviewing them` : ''
    throw new Error(`PLUGIN_INSTALL_${change.application.toUpperCase().replaceAll('-', '_')}: ${change.error?.code ?? change.packageResult?.kind ?? 'activation remains pending'}${pending}`)
  }
  const prof = profileDir(home, profile)
  const manifest = JSON.parse(readFileSync(join(prof, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; dsh?: { profile?: { bundles?: string[] } } }
  const dependency = manifest.dependencies?.[bundle.name]
  if (!dependency?.startsWith('link:') || realpathSync(resolve(prof, dependency.slice(5))) !== bundle.dir
    || !manifest.dsh?.profile?.bundles?.includes(bundle.name)
    || !existsSync(join(prof, 'node_modules', bundle.name, 'package.json'))
    || realpathSync(join(prof, 'node_modules', bundle.name)) !== bundle.dir) {
    throw new Error('PROFILE_INSTALL_UNPROVEN: public manager finished but the exact local package link/bundle was not observed')
  }
  const listed = await remote('listBundles') as BundleRow[]
  if (!Array.isArray(listed) || !listed.some(row => row.name === bundle.name && row.enabled && !row.error)) {
    throw new Error('HOST_BUNDLE_UNPROVEN: the official manager does not report the installed bundle enabled')
  }
  sameHost()
  return { ...bundle, profile, profileDir: prof, hostPid: before.pid, application: change.application, requestId,
    clientVerificationRequired: true, hostRestart: false }
}
