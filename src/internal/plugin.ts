import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
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
    inferred,
    runtimePackage: runtimePackage(dir),
  }
}

/** RC2 discovers browser bundles from resolvable package names, not source-file loader rows. */
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
