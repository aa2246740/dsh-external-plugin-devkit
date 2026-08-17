import { existsSync, readdirSync } from 'node:fs'
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

export function listPluginNames(root: string): string[] {
  const dir = pluginsDir(root)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
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
  }
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
