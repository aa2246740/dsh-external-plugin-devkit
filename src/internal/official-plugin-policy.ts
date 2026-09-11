import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import yaml from 'js-yaml'
import { writeText } from './io.ts'
import { profileDir, resolveDshHome } from './paths.ts'

const jsExpressionType = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  construct: value => value ?? '',
})
const compositionSchema = yaml.DEFAULT_SCHEMA.extend([jsExpressionType])

const SHIPPED_PRESET_ROOT = 'packages/preset/agent-presets/presets'
const COMPOSITION_FILE = 'agent.cordis.yml'
const POLICY_SCHEMA = 1 as const

/** Official Host/preset plugin ids that a profile patch may disable without a package name. */
const OFFICIAL_PLUGIN_NAMES: Record<string, string> = {
  'command-goal': '@deepseek-ai/dsh-command-goal',
  'tool-goal': '@deepseek-ai/dsh-tool-goal',
  'plan-mode': '@deepseek-ai/dsh-plan-mode',
  'ui-goal': '@deepseek-ai/dsh-client-ui-goal',
  'ui-plan': '@deepseek-ai/dsh-client-ui-plan',
}
const OFFICIAL_PLUGIN_IDS = new Set(Object.keys(OFFICIAL_PLUGIN_NAMES))

export type OfficialDisableSurfaceStatus =
  | 'kept-disabled'
  | 'restamped'
  | 'already-disabled'
  | 'absent'
  | 'home-survived'

export interface OfficialPluginDisable {
  id: string
  name: string
  surfaces: string[]
}

export interface OfficialPluginPolicy {
  schemaVersion: 1
  updatedAt: string
  disables: OfficialPluginDisable[]
}

export interface OfficialDisableSurfaceReport {
  surface: string
  status: OfficialDisableSurfaceStatus
}

export interface OfficialDisableReportItem {
  id: string
  name: string
  surfaces: OfficialDisableSurfaceReport[]
}

export interface OfficialDisableRestampResult {
  policy: OfficialPluginPolicy
  report: OfficialDisableReportItem[]
  changedPaths: string[]
}

interface CompositionRow {
  id: string
  name: string
  disabled: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function officialName(name: string): boolean {
  return name.startsWith('@deepseek-ai/')
}

function officialRow(id: string, name: string): boolean {
  return officialName(name) || OFFICIAL_PLUGIN_IDS.has(id)
}

export function officialPluginPolicyPath(home: string): string {
  return join(home, '.dshx', 'official-plugin-policy.json')
}

function loadComposition(text: string): unknown {
  return yaml.load(text, { schema: compositionSchema })
}

function walkRows(value: unknown, out: CompositionRow[]): void {
  if (!Array.isArray(value)) return
  for (const item of value) {
    if (!isRecord(item)) continue
    const id = typeof item.id === 'string' ? item.id : ''
    const name = typeof item.name === 'string' ? item.name : ''
    if (id !== '' || name !== '') {
      out.push({ id, name, disabled: item.disabled === true })
    }
    if (item.group === true) walkRows(item.config, out)
    if (Array.isArray(item.insert)) walkRows(item.insert, out)
  }
}

function compositionRows(text: string): CompositionRow[] {
  const rows: CompositionRow[] = []
  const parsed = loadComposition(text)
  walkRows(parsed, rows)
  return rows
}

function gitShow(root: string, path: string): string | undefined {
  const result = spawnSync('git', ['-C', root, 'show', `HEAD:${path}`], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  if (result.status !== 0) return undefined
  return result.stdout
}

function shippedPresetIds(root: string): string[] {
  const dir = join(root, SHIPPED_PRESET_ROOT)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
}

function shippedCompositionPath(presetId: string): string {
  return `${SHIPPED_PRESET_ROOT}/${presetId}/${COMPOSITION_FILE}`
}

function factoryDisabledIds(root: string): Set<string> {
  const disabled = new Set<string>()
  for (const presetId of shippedPresetIds(root)) {
    const text = gitShow(root, shippedCompositionPath(presetId))
    if (text === undefined) continue
    for (const row of compositionRows(text)) {
      if (row.disabled && officialRow(row.id, row.name)) disabled.add(row.id)
    }
  }
  return disabled
}

function canonicalName(id: string, name: string): string {
  if (officialName(name)) return name
  return OFFICIAL_PLUGIN_NAMES[id] ?? name
}

function addDisable(disables: Map<string, OfficialPluginDisable>, id: string, name: string, surface: string): void {
  const resolved = canonicalName(id, name)
  const current = disables.get(id)
  if (current === undefined) {
    disables.set(id, { id, name: resolved, surfaces: [surface] })
    return
  }
  if (!current.surfaces.includes(surface)) current.surfaces.push(surface)
  if (!officialName(current.name) && officialName(resolved)) current.name = resolved
}

function scanPatch(path: string, surface: string, disables: Map<string, OfficialPluginDisable>): void {
  if (!existsSync(path)) return
  for (const row of compositionRows(readFileSync(path, 'utf8'))) {
    if (!row.disabled || !officialRow(row.id, row.name)) continue
    addDisable(disables, row.id, row.name || row.id, surface)
  }
}

function mergeDisables(...lists: readonly OfficialPluginDisable[][]): OfficialPluginDisable[] {
  const merged = new Map<string, OfficialPluginDisable>()
  for (const list of lists) {
    for (const item of list) {
      for (const surface of item.surfaces) addDisable(merged, item.id, item.name, surface)
    }
  }
  return [...merged.values()].sort((left, right) => {
    const byId = left.id.localeCompare(right.id)
    return byId === 0 ? left.name.localeCompare(right.name) : byId
  }).map(item => ({ ...item, surfaces: [...item.surfaces].sort() }))
}

export function loadOfficialPluginPolicy(home: string): OfficialPluginPolicy | undefined {
  const path = officialPluginPolicyPath(home)
  if (!existsSync(path)) return undefined
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(parsed) || parsed.schemaVersion !== POLICY_SCHEMA || !Array.isArray(parsed.disables)) return undefined
  const disables: OfficialPluginDisable[] = []
  for (const value of parsed.disables) {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || !Array.isArray(value.surfaces)) continue
    const surfaces = value.surfaces.filter((surface): surface is string => typeof surface === 'string' && surface !== '')
    if (surfaces.length === 0) continue
    disables.push({ id: value.id, name: value.name, surfaces })
  }
  return {
    schemaVersion: POLICY_SCHEMA,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    disables,
  }
}

export function persistOfficialPluginPolicy(home: string, policy: OfficialPluginPolicy): string {
  const path = officialPluginPolicyPath(home)
  writeText(path, `${JSON.stringify(policy, null, 2)}\n`)
  return path
}

export function captureOfficialPluginDisables(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): OfficialPluginPolicy {
  const home = resolveDshHome(env)
  const stored = loadOfficialPluginPolicy(home)
  const found = new Map<string, OfficialPluginDisable>()
  const factory = factoryDisabledIds(root)

  for (const presetId of shippedPresetIds(root)) {
    const rel = shippedCompositionPath(presetId)
    const abs = join(root, rel)
    if (!existsSync(abs)) continue
    const current = compositionRows(readFileSync(abs, 'utf8'))
    const headText = gitShow(root, rel)
    const headDisabled = new Set(
      headText === undefined
        ? []
        : compositionRows(headText).filter(row => row.disabled).map(row => row.id),
    )
    for (const row of current) {
      if (!row.disabled || !officialRow(row.id, row.name)) continue
      if (headDisabled.has(row.id)) continue
      addDisable(found, row.id, row.name || row.id, `preset:${presetId}`)
    }
  }

  const userRoot = join(home, '.agent-presets')
  if (existsSync(userRoot)) {
    for (const entry of readdirSync(userRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const abs = join(userRoot, entry.name, COMPOSITION_FILE)
      if (!existsSync(abs)) continue
      for (const row of compositionRows(readFileSync(abs, 'utf8'))) {
        if (!row.disabled || !officialRow(row.id, row.name)) continue
        if (factory.has(row.id)) continue
        addDisable(found, row.id, row.name || row.id, `preset:${entry.name}`)
      }
    }
  }

  scanPatch(join(home, 'cordis.patch.yml'), 'home', found)
  scanPatch(join(profileDir(home, 'web'), 'cordis.patch.yml'), 'profile:web', found)

  const disables = mergeDisables(stored?.disables ?? [], [...found.values()])
  return {
    schemaVersion: POLICY_SCHEMA,
    updatedAt: new Date().toISOString(),
    disables,
  }
}

function parseIdLine(line: string): { indent: string; id: string } | undefined {
  const match = /^(\s*)- id:\s*(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/.exec(line)
  if (!match) return undefined
  return { indent: match[1] ?? '', id: match[2] ?? match[3] ?? match[4] ?? '' }
}

function rowBodyEnd(lines: string[], start: number, indent: string): number {
  const rowIndent = indent.length
  let index = start + 1
  while (index < lines.length) {
    const line = lines[index]!
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      index += 1
      continue
    }
    const next = parseIdLine(line)
    if (next !== undefined && next.indent.length <= rowIndent) break
    if (/^\s*-\s/.test(line) && line.search(/\S/) <= rowIndent) break
    index += 1
  }
  return index
}

export function ensureCompositionRowDisabled(text: string, id: string): { text: string; found: boolean; changed: boolean } {
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  let found = false
  let changed = false
  for (let index = 0; index < lines.length; index += 1) {
    const parsed = parseIdLine(lines[index]!)
    if (parsed?.id !== id) continue
    found = true
    const end = rowBodyEnd(lines, index, parsed.indent)
    const body = lines.slice(index + 1, end)
    const disabledAt = body.findIndex(line => /^\s*disabled:\s*/.test(line))
    if (disabledAt >= 0) {
      const line = body[disabledAt]!
      if (/^\s*disabled:\s*true\s*(?:#.*)?$/.test(line)) break
      if (/^\s*disabled:\s*!!/.test(line)) break
      const match = /^(\s*)disabled:\s*/.exec(line)
      lines[index + 1 + disabledAt] = `${match?.[1] ?? `${parsed.indent}  `}disabled: true`
      changed = true
      break
    }
    const nameAt = body.findIndex(line => /^\s*name:\s*/.test(line))
    const fieldIndent = nameAt >= 0
      ? (body[nameAt]!.match(/^(\s*)/)?.[1] ?? `${parsed.indent}  `)
      : `${parsed.indent}  `
    const insertAt = index + 1 + (nameAt >= 0 ? nameAt + 1 : 0)
    lines.splice(insertAt, 0, `${fieldIndent}disabled: true`)
    changed = true
    break
  }
  return { text: changed ? lines.join(newline) : text, found, changed }
}

function surfaceStillDisabled(root: string, home: string, surface: string, id: string): boolean {
  if (surface === 'home') {
    const path = join(home, 'cordis.patch.yml')
    return existsSync(path) && compositionRows(readFileSync(path, 'utf8')).some(row => row.id === id && row.disabled)
  }
  if (surface === 'profile:web') {
    const path = join(profileDir(home, 'web'), 'cordis.patch.yml')
    return existsSync(path) && compositionRows(readFileSync(path, 'utf8')).some(row => row.id === id && row.disabled)
  }
  if (!surface.startsWith('preset:')) return false
  const presetId = surface.slice('preset:'.length)
  const shipped = join(root, shippedCompositionPath(presetId))
  const user = join(home, '.agent-presets', presetId, COMPOSITION_FILE)
  const path = existsSync(shipped) ? shipped : user
  return existsSync(path) && compositionRows(readFileSync(path, 'utf8')).some(row => row.id === id && row.disabled)
}

export function restampOfficialPluginDisables(
  root: string,
  policy: OfficialPluginPolicy,
  env: NodeJS.ProcessEnv = process.env,
): OfficialDisableRestampResult {
  const home = resolveDshHome(env)
  const changedPaths: string[] = []
  const report: OfficialDisableReportItem[] = []

  for (const item of policy.disables) {
    const surfaces: OfficialDisableSurfaceReport[] = []
    for (const surface of item.surfaces) {
      if (surface.startsWith('preset:') && existsSync(join(root, shippedCompositionPath(surface.slice('preset:'.length))))) {
        const rel = shippedCompositionPath(surface.slice('preset:'.length))
        const abs = join(root, rel)
        const current = readFileSync(abs, 'utf8')
        const next = ensureCompositionRowDisabled(current, item.id)
        if (!next.found) {
          surfaces.push({ surface, status: 'absent' })
          continue
        }
        if (next.changed) {
          writeText(abs, next.text.endsWith('\n') ? next.text : `${next.text}\n`)
          if (!changedPaths.includes(rel)) changedPaths.push(rel)
          surfaces.push({ surface, status: 'restamped' })
          continue
        }
        surfaces.push({ surface, status: 'already-disabled' })
        continue
      }
      surfaces.push({
        surface,
        status: surfaceStillDisabled(root, home, surface, item.id) ? 'home-survived' : 'absent',
      })
    }
    report.push({ id: item.id, name: item.name, surfaces })
  }

  return { policy, report, changedPaths }
}

function stripDisabled(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDisabled)
  if (!isRecord(value)) return value
  const copy: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'disabled') continue
    copy[key] = stripDisabled(entry)
  }
  return copy
}

export function officialDisableOnlyDirty(
  root: string,
  trackedChanges: readonly string[],
  policy: OfficialPluginPolicy,
): boolean {
  if (trackedChanges.length === 0) return true
  const allowed = new Set(policy.disables.map(item => item.id))
  for (const path of trackedChanges) {
    if (!/^packages\/preset\/agent-presets\/presets\/[^/]+\/agent\.cordis\.yml$/.test(path)) return false
    const abs = join(root, path)
    if (!existsSync(abs)) return false
    const head = gitShow(root, path)
    if (head === undefined) return false
    const currentText = readFileSync(abs, 'utf8')
    if (JSON.stringify(stripDisabled(loadComposition(head))) !== JSON.stringify(stripDisabled(loadComposition(currentText)))) {
      return false
    }
    const headDisabled = new Set(compositionRows(head).filter(row => row.disabled).map(row => row.id))
    const currentDisabled = compositionRows(currentText).filter(row => row.disabled).map(row => row.id)
    for (const id of currentDisabled) {
      if (headDisabled.has(id)) continue
      if (!allowed.has(id)) return false
    }
    for (const id of headDisabled) {
      if (!currentDisabled.includes(id)) return false
    }
  }
  return true
}

export function officialDisableReportLines(report: readonly OfficialDisableReportItem[]): string[] {
  return report.map(item => {
    const surfaces = item.surfaces.map(entry => `${entry.surface} (${entry.status})`).join(', ')
    return `${item.id} (${item.name}): ${surfaces}`
  })
}
