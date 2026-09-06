import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, posix, relative, resolve } from 'node:path'
import { loadYaml, readText } from './io.ts'
import { pluginsDir } from './paths.ts'
import type { PluginKind, PluginManifest, ProfileName } from './types.ts'

interface RawManifest {
  id?: string
  name?: string
  entry?: string
  marker?: string
  kind?: PluginKind
  inject?: string[]
  profile?: ProfileName
  config?: Record<string, unknown>
  hotReload?: {
    artifacts?: unknown
  }
}

const HOT_RELOAD_ARTIFACT_LIMIT = 32
const JAVASCRIPT_TYPESCRIPT_SOURCE = /\.(?:[cm]?[jt]sx?)$/
const DECLARATION_SOURCE = /\.d\.(?:[cm]?ts)$/
const GLOB_SYNTAX = /[*?{}[\]!()]/

function within(path: string, parent: string): boolean {
  const rel = relative(parent, path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function validateArtifactPath(dir: string, raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 1024) {
    throw new Error('hotReload.artifacts entries must be non-empty package-relative paths')
  }
  if (raw.includes('\\') || isAbsolute(raw) || /^[A-Za-z]:/.test(raw) || raw.includes('\0')) {
    throw new Error(`hotReload artifact must be a package-relative path: ${raw}`)
  }
  if (GLOB_SYNTAX.test(raw)) throw new Error(`hotReload artifact cannot contain glob syntax: ${raw}`)
  const parts = raw.split('/')
  if (parts.some(part => part === '' || part === '.' || part === '..')) {
    throw new Error(`hotReload artifact must use an exact normalized path: ${raw}`)
  }
  if (parts.some(part => part === 'node_modules')) {
    throw new Error(`hotReload artifact cannot target node_modules: ${raw}`)
  }
  if (posix.normalize(raw) !== raw) {
    throw new Error(`hotReload artifact must use an exact normalized path: ${raw}`)
  }
  if (!JAVASCRIPT_TYPESCRIPT_SOURCE.test(raw) || DECLARATION_SOURCE.test(raw)) {
    throw new Error(`hotReload artifact must be a JavaScript or TypeScript runtime source file: ${raw}`)
  }

  // The package itself may be the supported my-plugins symlink to an external
  // source tree. No component beneath that real package root may be a symlink.
  const packageRoot = realpathSync(dir)
  let cursor = packageRoot
  for (const part of parts) {
    cursor = join(cursor, part)
    let stat
    try {
      stat = lstatSync(cursor)
    } catch {
      throw new Error(`hotReload artifact missing: ${raw}`)
    }
    if (stat.isSymbolicLink()) throw new Error(`hotReload artifact cannot traverse a symlink: ${raw}`)
  }
  if (!lstatSync(cursor).isFile()) throw new Error(`hotReload artifact is not a regular file: ${raw}`)
  if (!within(realpathSync(cursor), packageRoot)) throw new Error(`hotReload artifact escapes the package: ${raw}`)
  return raw
}

function hotReloadConfig(dir: string, entry: string, raw: RawManifest['hotReload']): NonNullable<PluginManifest['hotReload']> {
  if (raw !== undefined && !isRecord(raw)) throw new Error('hotReload must be an object')
  if (raw && Object.keys(raw).some(key => key !== 'artifacts')) {
    throw new Error('hotReload supports only the artifacts field')
  }
  const configured = raw?.artifacts
  if (configured !== undefined && !Array.isArray(configured)) {
    throw new Error('hotReload.artifacts must be an array')
  }
  const artifacts = configured === undefined ? [entry] : configured
  if (artifacts.length === 0 || artifacts.length > HOT_RELOAD_ARTIFACT_LIMIT) {
    throw new Error(`hotReload.artifacts must contain 1 to ${HOT_RELOAD_ARTIFACT_LIMIT} files`)
  }
  const checked = artifacts.map(item => validateArtifactPath(dir, item))
  if (new Set(checked).size !== checked.length) throw new Error('hotReload.artifacts cannot contain duplicate paths')
  if (!checked.includes(entry)) throw new Error(`hotReload.artifacts must include the plugin entry: ${entry}`)
  return { artifacts: checked }
}

/** Apply the same strict artifact boundary at the command gate, including the entry-only default. */
export function resolveHotReloadArtifacts(dir: string, entry: string, artifacts?: unknown): string[] {
  return hotReloadConfig(dir, entry, { artifacts }).artifacts
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function runtimePackage(dir: string): PluginManifest['runtimePackage'] {
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) return undefined
  const parsed: unknown = JSON.parse(readText(manifestPath))
  if (!isRecord(parsed)) throw new Error(`package manifest must hold a JSON object: ${manifestPath}`)
  const name = parsed.name
  if (typeof name !== 'string' || name.length === 0) return undefined
  const dsh = isRecord(parsed.dsh) ? parsed.dsh : undefined
  const client = dsh && isRecord(dsh.client) ? dsh.client : undefined
  return {
    name,
    manifestPath,
    webClient: client?.platform === 'web',
  }
}

export function listPluginNames(root: string): string[] {
  const dir = pluginsDir(root)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => {
      if (entry.name.startsWith('.')) return false
      if (entry.isDirectory()) return true
      if (!entry.isSymbolicLink()) return false
      try {
        return statSync(join(dir, entry.name)).isDirectory()
      } catch {
        return false
      }
    })
    .map(entry => entry.name)
    .sort()
}

export function resolvePluginDir(root: string, nameOrPath?: string): string {
  if (!nameOrPath) {
    const names = listPluginNames(root)
    if (names.length === 1) return join(pluginsDir(root), names[0]!)
    throw new Error(`specify a plugin name. available: ${names.join(', ') || '(none under my-plugins/)'}`)
  }
  const asPath = resolve(root, nameOrPath)
  if (existsSync(asPath) && existsSync(join(asPath, 'src'))) return asPath
  if (existsSync(asPath) && (existsSync(join(asPath, 'dshx.yml')) || existsSync(join(asPath, 'cordis.yml')))) {
    return asPath
  }
  const under = join(pluginsDir(root), nameOrPath)
  if (existsSync(under)) return under
  throw new Error(`plugin not found: ${nameOrPath} (looked at ${asPath} and ${under})`)
}

function pickEntry(dir: string, id: string): string {
  const candidates = [
    `src/${id}.ts`,
    'src/index.ts',
    'src/hello.ts',
    'index.ts',
  ]
  for (const rel of candidates) {
    if (existsSync(join(dir, rel))) return rel
  }
  const src = join(dir, 'src')
  if (existsSync(src)) {
    const first = readdirSync(src).find(name => name.endsWith('.ts') && !name.endsWith('.d.ts'))
    if (first) return `src/${first}`
  }
  throw new Error(`cannot infer plugin entry under ${dir}`)
}

function inferMarker(source: string): string | undefined {
  const match = source.match(/console\.log\(\s*(['"`])([^'"`]+)\1/)
  return match?.[2]
}

export function loadPlugin(root: string, nameOrPath?: string): PluginManifest {
  const dir = resolvePluginDir(root, nameOrPath)
  const idGuess = basename(dir)
  const rawPath = join(dir, 'dshx.yml')
  let raw: RawManifest = {}
  let inferred = true
  if (existsSync(rawPath)) {
    const parsed = loadYaml(readText(rawPath))
    if (parsed && typeof parsed === 'object') {
      raw = parsed as RawManifest
      inferred = false
    }
  }
  const id = raw.id ?? idGuess
  const entry = raw.entry ?? pickEntry(dir, id)
  const entryAbs = resolve(dir, entry)
  if (!existsSync(entryAbs)) throw new Error(`plugin entry missing: ${entryAbs}`)
  const source = readText(entryAbs)
  const hotReload = raw.hotReload === undefined ? undefined : hotReloadConfig(dir, entry, raw.hotReload)
  return {
    id,
    name: raw.name ?? id,
    dir,
    entry,
    entryAbs,
    marker: raw.marker ?? inferMarker(source),
    kind: raw.kind ?? (source.includes('defineTool') ? 'tool' : 'function'),
    inject: raw.inject,
    profile: raw.profile ?? 'web',
    config: raw.config,
    ...hotReload ? { hotReload } : {},
    inferred,
    runtimePackage: runtimePackage(dir),
  }
}

/** Current Harness releases discover browser bundles from resolvable package names, not source-file loader rows. */
export function runtimePluginSpecifier(plugin: PluginManifest): string {
  return plugin.runtimePackage?.webClient === true ? plugin.runtimePackage.name : plugin.entryAbs
}

export function readCommittedOverlay(dir: string): unknown {
  const file = join(dir, 'cordis.yml')
  if (!existsSync(file)) return undefined
  return loadYaml(readText(file))
}

export function pluginSource(plugin: PluginManifest): string {
  return readText(plugin.entryAbs)
}

export function parentPluginName(plugin: PluginManifest): string {
  return basename(dirname(plugin.entryAbs)) === 'src' ? basename(plugin.dir) : plugin.id
}
