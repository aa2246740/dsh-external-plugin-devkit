import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { currentHost } from './host.ts'
import { resolveLocalSpec } from './file-copy.ts'
import { pluginsDir, profileDir, resolveDshHome } from './paths.ts'
import { loadPlugin, pluginSource } from './plugin.ts'

interface GitResult {
  ok: boolean
  stdout: string
  stderr: string
}

interface ReleaseRef {
  tag: string
  sha: string
  version: readonly [number, number, number]
  prerelease: readonly (number | string)[]
}

export type MarkerObservation = 'console' | 'logger-only' | 'missing'
export type PluginLocation = 'directory' | 'symlink' | 'profile-file' | 'profile-link' | 'source-override'

export interface UpdatePluginInventory {
  name: string
  id?: string
  packageName?: string
  activeInProfile?: boolean
  path: string
  realPath: string
  location: PluginLocation
  activeSourcePath?: string
  sourceOverride?: string
  version?: string
  client: boolean
  build: boolean
  marker: MarkerObservation
  valid: boolean
  issue?: string
}

export interface UpdateCheckoutState {
  branch: string
  sha: string
  version: string
  origin: string
  trackedChanges: string[]
  untrackedPaths: string[]
  targetCollisions: string[]
}

export interface UpdateTargetState {
  tag: string
  sha: string
  version: string
  local: boolean
}

export interface UpdatePlan {
  checkout: UpdateCheckoutState
  target: UpdateTargetState
  plugins: UpdatePluginInventory[]
  staleProfileDependencies: Array<{ name: string; spec: string; source: string }>
  supervisedHost?: { pid: number; port: number; ownership: string }
  blockers: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function packageJson(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  return isRecord(parsed) ? parsed : undefined
}

function stringField(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' ? value : undefined
}

function git(root: string, args: readonly string[]): GitResult {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function parsePrerelease(value: string | undefined): readonly (number | string)[] {
  if (!value) return []
  return value.split('.').map(part => /^\d+$/.test(part) ? Number(part) : part)
}

export function parseReleaseRef(tag: string, sha: string): ReleaseRef | undefined {
  const match = /^dsh-v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(tag)
  if (!match) return undefined
  return {
    tag,
    sha,
    version: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: parsePrerelease(match[4]),
  }
}

function compareIdentifier(left: number | string, right: number | string): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  if (typeof left === 'number') return -1
  if (typeof right === 'number') return 1
  return left.localeCompare(right)
}

export function compareReleaseRefs(left: ReleaseRef, right: ReleaseRef): number {
  for (let index = 0; index < left.version.length; index += 1) {
    const compared = left.version[index]! - right.version[index]!
    if (compared !== 0) return compared
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) return 0
    return left.prerelease.length === 0 ? 1 : -1
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const l = left.prerelease[index]
    const r = right.prerelease[index]
    if (l === undefined || r === undefined) return l === r ? 0 : l === undefined ? -1 : 1
    const compared = compareIdentifier(l, r)
    if (compared !== 0) return compared
  }
  return 0
}

export function latestReleaseRef(text: string): ReleaseRef | undefined {
  const releases = text.split(/\r?\n/).flatMap(line => {
    const [sha, ref] = line.trim().split(/\s+/, 2)
    if (!sha || !ref?.startsWith('refs/tags/')) return []
    const parsed = parseReleaseRef(ref.slice('refs/tags/'.length), sha)
    return parsed ? [parsed] : []
  })
  return releases.sort(compareReleaseRefs).at(-1)
}

function officialOrigin(url: string): boolean {
  return /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)?deepseek-ai\/deepseek-harness(?:\.git)?$/.test(url)
}

function gitValue(root: string, args: readonly string[], label: string): string {
  const result = git(root, args)
  if (!result.ok) throw new Error(`${label}: ${result.stderr.trim() || 'git command failed'}`)
  return result.stdout.trim()
}

function resolveTarget(root: string, requested?: string): UpdateTargetState {
  if (requested) {
    const local = git(root, ['rev-parse', '--verify', `${requested}^{commit}`])
    if (local.ok) {
      const parsed = parseReleaseRef(requested, local.stdout.trim())
      if (!parsed) throw new Error(`--target must be a release tag like dsh-v0.1.1-rc.2: ${requested}`)
      return { tag: parsed.tag, sha: parsed.sha, version: parsed.tag.slice('dsh-v'.length), local: true }
    }
    const remote = git(root, ['ls-remote', '--tags', '--refs', 'origin', `refs/tags/${requested}`])
    const hit = latestReleaseRef(remote.stdout)
    if (!remote.ok || !hit || hit.tag !== requested) {
      throw new Error(`target release not found locally or on origin: ${requested}`)
    }
    return { tag: hit.tag, sha: hit.sha, version: hit.tag.slice('dsh-v'.length), local: false }
  }
  const remote = git(root, ['ls-remote', '--tags', '--refs', 'origin', 'refs/tags/dsh-v*'])
  if (!remote.ok) throw new Error(`cannot query official release tags: ${remote.stderr.trim() || 'git ls-remote failed'}`)
  const hit = latestReleaseRef(remote.stdout)
  if (!hit) throw new Error('origin exposes no dsh-v* release tags')
  const local = git(root, ['cat-file', '-e', `${hit.sha}^{commit}`]).ok
  return { tag: hit.tag, sha: hit.sha, version: hit.tag.slice('dsh-v'.length), local }
}

function statusState(root: string): Pick<UpdateCheckoutState, 'trackedChanges' | 'untrackedPaths'> {
  const result = git(root, ['status', '--porcelain=v1', '--untracked-files=all'])
  if (!result.ok) throw new Error(`git status: ${result.stderr.trim() || 'failed'}`)
  const trackedChanges: string[] = []
  const untrackedPaths: string[] = []
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.length < 4) continue
    const path = line.slice(3)
    if (line.startsWith('?? ')) untrackedPaths.push(path)
    else trackedChanges.push(path)
  }
  return { trackedChanges, untrackedPaths }
}

function targetCollisions(root: string, target: UpdateTargetState, untrackedPaths: readonly string[]): string[] {
  if (!target.local || untrackedPaths.length === 0) return []
  const tree = git(root, ['ls-tree', '-r', '--name-only', target.sha])
  if (!tree.ok) return []
  const tracked = new Set(tree.stdout.split(/\r?\n/).filter(Boolean))
  return untrackedPaths.filter(path => tracked.has(path))
}

function clientPlugin(pkg: Record<string, unknown> | undefined): boolean {
  const dsh = pkg?.dsh
  if (isRecord(dsh) && isRecord(dsh.client)) return true
  const exports = pkg?.exports
  return isRecord(exports) && './client' in exports
}

function inventoryPlugin(root: string, name: string, path: string, location: PluginLocation): UpdatePluginInventory {
  try {
    if (!statSync(path).isDirectory()) throw new Error(`plugin source is not a directory: ${path}`)
    const pkg = packageJson(join(path, 'package.json'))
    const manifest = loadPlugin(root, path)
    const source = pluginSource(manifest)
    const marker: MarkerObservation = !manifest.marker
      ? 'missing'
      : source.includes(`console.log`) && source.includes(manifest.marker)
        ? 'console'
        : source.includes(manifest.marker)
          ? 'logger-only'
          : 'missing'
    return {
      name,
      id: manifest.id,
      packageName: stringField(pkg, 'name'),
      path: path.startsWith(root) ? relative(root, path) : path,
      realPath: realpathSync(path),
      location,
      version: stringField(pkg, 'version'),
      client: clientPlugin(pkg),
      build: isRecord(pkg?.scripts) && typeof pkg.scripts.build === 'string',
      marker,
      valid: true,
    }
  } catch (error) {
    let realPath = resolve(path)
    try {
      if (lstatSync(path).isSymbolicLink()) realPath = realpathSync(path)
    } catch {
      // retain the unresolved path for the report
    }
    return {
      name,
      path: path.startsWith(root) ? relative(root, path) : path,
      realPath,
      location,
      client: false,
      build: false,
      marker: 'missing',
      valid: false,
      issue: error instanceof Error ? error.message : String(error),
    }
  }
}

function workspacePluginInventory(root: string): UpdatePluginInventory[] {
  const dir = pluginsDir(root)
  if (!existsSync(dir)) return []
  const plugins: UpdatePluginInventory[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    let location: PluginLocation
    if (entry.isDirectory()) location = 'directory'
    else if (entry.isSymbolicLink()) location = 'symlink'
    else continue
    plugins.push(inventoryPlugin(root, entry.name, path, location))
  }
  return plugins
}

function markDuplicateIds(plugins: UpdatePluginInventory[]): void {
  const grouped = new Map<string, UpdatePluginInventory[]>()
  for (const plugin of plugins) {
    if (!plugin.valid || !plugin.id) continue
    const group = grouped.get(plugin.id) ?? []
    group.push(plugin)
    grouped.set(plugin.id, group)
  }
  for (const [id, group] of grouped) {
    if (group.length < 2) continue
    const labels = group.map(plugin => plugin.name).sort().join(', ')
    for (const plugin of group) {
      plugin.valid = false
      plugin.issue = `plugin id ${id} is declared by multiple active candidate sources: ${labels}`
    }
  }
}

function pluginInventory(root: string, env: NodeJS.ProcessEnv): {
  plugins: UpdatePluginInventory[]
  staleProfileDependencies: UpdatePlan['staleProfileDependencies']
} {
  let plugins = workspacePluginInventory(root)
  const staleProfileDependencies: UpdatePlan['staleProfileDependencies'] = []
  const profile = profileDir(resolveDshHome(env), 'web')
  const manifest = packageJson(join(profile, 'package.json'))
  const dependencies = isRecord(manifest?.dependencies) ? manifest.dependencies : {}
  const dsh = isRecord(manifest?.dsh) ? manifest.dsh : undefined
  const profileConfig = isRecord(dsh?.profile) ? dsh.profile : undefined
  const activeBundles = new Set(Array.isArray(profileConfig?.bundles)
    ? profileConfig.bundles.filter((value): value is string => typeof value === 'string')
    : [])
  for (const [name, raw] of Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right))) {
    if (typeof raw !== 'string') continue
    const source = resolveLocalSpec(raw, profile)
    if (!source) continue
    if (!existsSync(source)) {
      staleProfileDependencies.push({ name, spec: raw, source })
      continue
    }
    const location: PluginLocation = raw.startsWith('file:') ? 'profile-file' : 'profile-link'
    const active = inventoryPlugin(root, name, source, location)
    // A profile dependency is what Web will actually resolve. It displaces an
    // inactive my-plugins copy by package name before we check stable plugin ids.
    plugins = plugins.filter(plugin => plugin.name !== name)
    plugins.push(active)
  }
  const activeIds = new Set(plugins
    .filter(plugin => plugin.valid && (plugin.location === 'profile-file' || plugin.location === 'profile-link'))
    .flatMap(plugin => plugin.id ? [plugin.id] : []))
  // A profile source also wins when an old workspace directory uses another
  // package name but declares the same Host/Loader id.
  plugins = plugins.filter(plugin => (plugin.location === 'profile-file' || plugin.location === 'profile-link') || !plugin.id || !activeIds.has(plugin.id))
  plugins = plugins.map(plugin => ({
    ...plugin,
    activeInProfile: plugin.location === 'profile-file'
      || plugin.location === 'profile-link'
      || activeBundles.has(plugin.packageName ?? plugin.name)
      || activeBundles.has(plugin.name),
  }))
  markDuplicateIds(plugins)
  return {
    plugins: plugins.sort((left, right) => left.name.localeCompare(right.name)),
    staleProfileDependencies,
  }
}

function sourceOverride(spec: string): { name: string; source: string } {
  const split = spec.indexOf('=')
  const name = split > 0 ? spec.slice(0, split) : ''
  const source = split > 0 ? spec.slice(split + 1) : ''
  if (!name || !source || !isAbsolute(source)) {
    throw new Error(`--plugin-source must be name=/absolute/path: ${spec}`)
  }
  return { name, source: resolve(source) }
}

export function applyPluginSourceOverrides(root: string, plugins: readonly UpdatePluginInventory[], specs: readonly string[] = []): UpdatePluginInventory[] {
  if (specs.length === 0) return [...plugins]
  const selected = new Map<string, string>()
  for (const raw of specs) {
    const item = sourceOverride(raw)
    if (selected.has(item.name)) throw new Error(`plugin source override is repeated for ${item.name}`)
    selected.set(item.name, item.source)
  }
  const known = new Set(plugins.map(plugin => plugin.name))
  for (const name of selected.keys()) {
    if (!known.has(name)) throw new Error(`plugin source override names no inventoried plugin: ${name}`)
  }
  return plugins.map(plugin => {
    const source = selected.get(plugin.name)
    if (!source) return plugin
    if (!plugin.valid) throw new Error(`cannot override invalid plugin ${plugin.name}: ${plugin.issue ?? 'invalid source'}`)
    if (!existsSync(source) || !statSync(source).isDirectory()) {
      throw new Error(`plugin source override is not a directory: ${plugin.name}=${source}`)
    }
    const override = inventoryPlugin(root, plugin.name, source, 'source-override')
    if (!override.valid) throw new Error(`invalid plugin source override for ${plugin.name}: ${override.issue ?? source}`)
    if (override.id !== plugin.id) {
      throw new Error(`plugin source override id mismatch for ${plugin.name}: ${override.id ?? '(missing)'} != ${plugin.id ?? '(missing)'}`)
    }
    if (override.packageName !== plugin.packageName) {
      throw new Error(`plugin source override package mismatch for ${plugin.name}: ${override.packageName ?? '(missing)'} != ${plugin.packageName ?? '(missing)'}`)
    }
    return {
      ...override,
      activeInProfile: plugin.activeInProfile,
      activeSourcePath: plugin.realPath,
      sourceOverride: override.realPath,
    }
  })
}

export function collectUpdatePlan(root: string, requestedTarget?: string, env: NodeJS.ProcessEnv = process.env, sourceOverrides: readonly string[] = []): UpdatePlan {
  const origin = gitValue(root, ['remote', 'get-url', 'origin'], 'origin')
  const target = resolveTarget(root, requestedTarget)
  const status = statusState(root)
  const checkout: UpdateCheckoutState = {
    branch: gitValue(root, ['branch', '--show-current'], 'current branch') || '(detached)',
    sha: gitValue(root, ['rev-parse', 'HEAD'], 'current commit'),
    version: stringField(packageJson(join(root, 'package.json')), 'version') ?? '(unknown)',
    origin,
    trackedChanges: status.trackedChanges,
    untrackedPaths: status.untrackedPaths,
    targetCollisions: targetCollisions(root, target, status.untrackedPaths),
  }
  const inventory = pluginInventory(root, env)
  const plugins = applyPluginSourceOverrides(root, inventory.plugins, sourceOverrides)
  const { staleProfileDependencies } = inventory
  const blockers: string[] = []
  if (!officialOrigin(origin)) blockers.push(`origin is not deepseek-ai/deepseek-harness: ${origin}`)
  if (checkout.trackedChanges.length > 0) blockers.push(`tracked Harness changes must be preserved before apply (${checkout.trackedChanges.length})`)
  if (checkout.targetCollisions.length > 0) blockers.push(`target would overwrite untracked paths (${checkout.targetCollisions.length})`)
  const invalid = plugins.filter(plugin => !plugin.valid)
  if (invalid.length > 0) blockers.push(`invalid local plugin sources (${invalid.map(plugin => plugin.name).join(', ')})`)
  const host = currentHost(root)
  return {
    checkout,
    target,
    plugins,
    staleProfileDependencies,
    ...host ? { supervisedHost: { pid: host.pid, port: host.port, ownership: host.ownership ?? 'spawned' } } : {},
    blockers,
  }
}
