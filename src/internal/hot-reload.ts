import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import yaml from 'js-yaml'
import { checkPlugin } from './check.ts'
import {
  acquireCreatorActivationLock,
  assertCreatorClaim,
  readCreatorContext,
  type CreatorContext,
} from './creator.ts'
import { currentHost, probePort, type PortProbe } from './host.ts'
import { readProcessStartTime, type TextProbe } from './host-discovery.ts'
import {
  writeHotReloadJournal,
  type HotReloadJournalRecord,
  type HotReloadJournalStage,
} from './hot-reload-journal.ts'
import { writeWatchedPatch } from './new-client.ts'
import { profileDir, resolveDshHome } from './paths.ts'
import { loadPlugin, resolveHotReloadArtifacts } from './plugin.ts'
import type { HostState, HotReloadArtifactHash, HotReloadScope, PluginManifest, ProfileName } from './types.ts'

const PLUGIN_ID = /^[a-z][a-z0-9-]*$/
const HMR_MODULE = '@deepseek-ai/cordis-plugin-hmr'
const MANAGED_MARKER = /^# dshx hot-reload (?:begin|end) /m
const PHASES = ['READY', 'MODULE_RELOADED', 'HMR_DISPOSED', 'OBSERVER_DISPOSED'] as const
const OBSERVER_FAILURES = new Set([
  'TARGET_DISPOSE_UNAVAILABLE',
  'TARGET_DISPOSE_WAIT_FAILED',
  'HMR_DISPOSE_UNAVAILABLE',
  'HMR_DISPOSE_WAIT_FAILED',
  'OBSERVER_POLL_FAILED',
  'ROOT_TARGET_AMBIGUOUS',
  'ROOT_RUNTIME_SCOPE_AMBIGUOUS',
  'PRESET_ANCHOR_INVALID',
  'PRESET_RUNTIME_AMBIGUOUS',
  'ACTIVE_HMR_AUDIT_FAILED',
  'PRESET_ROOT_SCOPE_PRESENT',
  'HMR_EVENT_SCOPE_EXCEEDED',
])
const TRANSACTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const jsExpressionType = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  construct: value => value ?? '',
})
const patchSchema = yaml.DEFAULT_SCHEMA.extend([jsExpressionType])

type HotReloadPhase = typeof PHASES[number]

interface ObserverReload {
  at: string
  oldGenerationIds: string[]
  newGenerationIds: string[]
  hmrEventAt: string
  hmrEventMatchedGenerationIds: string[]
  samePid: true
}

interface ObserverDisposal {
  at: string
  generationId: string
}

interface ObserverTargetGeneration {
  generationId: string
  state: 'ACTIVE' | 'FAILED'
}

interface ObserverReport {
  version: 1
  transactionId: string
  pluginId: string
  hmrEntryId: string
  targetScope: HotReloadScope
  expectedPid: number
  pid: number
  samePid: true
  phase: HotReloadPhase
  readyAt: string
  targetGenerationIds: string[]
  targetGenerationStates: ObserverTargetGeneration[]
  hmrGenerationId: string
  moduleReloaded?: ObserverReload
  hmrDisposed?: ObserverDisposal
  observerDisposed?: { at: string }
  discoveryAnchor?: { disabled: true; hasFiber: false }
}

interface BoundHost {
  pid: number
  processStartedAt: string
  home: string
  root: string
  profile: 'web'
  port: number
}

interface ManagedBlocks {
  full: string
  observerOnly: string
  hmrEntryId: string
  observerEntryId: string
  anchorEntryId?: string
}

interface ResolvedTarget {
  entryPath: string
  entryId: string
  entryName: string
}

interface ArtifactState {
  path: string
  absolutePath: string
  before: string
  mtimeBeforeMs: number
}

export interface HotReloadProof {
  sameHost: true
  targetScope: HotReloadScope
  artifactHashes: HotReloadArtifactHash[]
  hashBefore: string
  hashAfter: string
  bytesUnchanged: true
  mtimeBeforeMs: number
  mtimeAfterMs: number
  ready: ObserverReport
  moduleReloaded: ObserverReport
  hmrDisposed: ObserverReport
  observerDisposed: ObserverReport
}

export interface HotReloadPluginResult {
  pluginId: string
  profile: 'web'
  hostPid: number
  hostPort: number
  sourcePath: string
  entryPath: string
  patchPath: string
  transactionId: string
  hmrEntryId: string
  observerEntryId: string
  anchorEntryId?: string
  targetScope: HotReloadScope
  watchRoots: string[]
  hostRestart: false
  journal: {
    path: string
    status: 'succeeded'
    automaticRecovery: false
    cleanupProved: true
  }
  proof: HotReloadProof
}

export interface HotReloadDependencies {
  dshHome?: string
  currentHost?: (root: string) => HostState | undefined
  processStart?: (pid: number) => TextProbe
  portProbe?: (port: number) => Promise<PortProbe>
  creatorContext?: () => CreatorContext | undefined
  pluginLoader?: (root: string, pluginId: string) => PluginManifest
  pluginChecker?: typeof checkPlugin
  observerPath?: string
  uuid?: () => string
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  writePatch?: typeof writeWatchedPatch
  touch?: (path: string, at: Date) => void
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function parsePatch(text: string): unknown[] {
  const parsed = yaml.load(text, { schema: patchSchema })
  if (parsed === undefined || parsed === null) return []
  if (!Array.isArray(parsed)) throw new Error('watched cordis.patch.yml must be a top-level YAML array')
  return parsed
}

function canonicalExisting(path: string, label: string): string {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`)
  return realpathSync(path)
}

function within(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}${sep}`)
}

function overlaps(first: string, second: string): boolean {
  return within(first, second) || within(second, first)
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function phaseIndex(phase: HotReloadPhase): number {
  return PHASES.indexOf(phase)
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`hot-reload observer ${label} must be an ISO timestamp`)
  }
  return value
}

function generationIds(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128
    || value.some(id => typeof id !== 'string' || !/^generation-[1-9][0-9]*$/.test(id))) {
    throw new Error(`hot-reload observer ${label} must be a bounded generation id array`)
  }
  if (new Set(value).size !== value.length) throw new Error(`hot-reload observer ${label} contains duplicates`)
  return value as string[]
}

function validateObserverReport(
  value: unknown,
  expected: { transactionId: string; pluginId: string; hmrEntryId: string; targetScope: HotReloadScope; pid: number },
): ObserverReport {
  const report = record(value)
  if (!report || report.version !== 1 || report.transactionId !== expected.transactionId
    || report.pluginId !== expected.pluginId || report.hmrEntryId !== expected.hmrEntryId
    || report.targetScope !== expected.targetScope
    || report.expectedPid !== expected.pid || report.pid !== expected.pid
    || report.samePid !== true) {
    throw new Error('hot-reload observer report identity is incomplete or mismatched')
  }
  if (report.phase === 'FAILED' || report.failure !== undefined) {
    const failure = record(report.failure)
    const code = failure?.code
    if (typeof code !== 'string' || !OBSERVER_FAILURES.has(code)) {
      throw new Error('hot-reload observer reported an invalid failure classification')
    }
    timestamp(failure?.at, 'failure.at')
    throw new Error(`hot-reload observer failed: ${code}`)
  }
  if (!PHASES.includes(report.phase as HotReloadPhase)) {
    throw new Error('hot-reload observer report phase is invalid')
  }
  const phase = report.phase as HotReloadPhase
  const readyAt = timestamp(report.readyAt, 'readyAt')
  const targets = generationIds(report.targetGenerationIds, 'targetGenerationIds')
  if (!Array.isArray(report.targetGenerationStates)
    || report.targetGenerationStates.length !== targets.length) {
    throw new Error('hot-reload observer targetGenerationStates must match READY generations')
  }
  const targetGenerationStates = report.targetGenerationStates.map((value, index) => {
    const target = record(value)
    if (target?.generationId !== targets[index]
      || (target.state !== 'ACTIVE' && target.state !== 'FAILED')) {
      throw new Error('hot-reload observer targetGenerationStates contain an invalid generation or state')
    }
    return { generationId: targets[index]!, state: target.state } as ObserverTargetGeneration
  })
  if (typeof report.hmrGenerationId !== 'string' || !/^generation-[1-9][0-9]*$/.test(report.hmrGenerationId)) {
    throw new Error('hot-reload observer hmrGenerationId is invalid')
  }
  const validated: ObserverReport = {
    version: 1,
    transactionId: expected.transactionId,
    pluginId: expected.pluginId,
    hmrEntryId: expected.hmrEntryId,
    targetScope: expected.targetScope,
    expectedPid: expected.pid,
    pid: expected.pid,
    samePid: true,
    phase,
    readyAt,
    targetGenerationIds: targets,
    targetGenerationStates,
    hmrGenerationId: report.hmrGenerationId,
  }
  if (expected.targetScope === 'preset') {
    const anchor = record(report.discoveryAnchor)
    if (anchor?.disabled !== true || anchor.hasFiber !== false) {
      throw new Error('hot-reload observer preset discovery anchor proof is missing')
    }
    validated.discoveryAnchor = { disabled: true, hasFiber: false }
  } else if (report.discoveryAnchor !== undefined) {
    throw new Error('hot-reload observer root report contains an unexpected discovery anchor')
  }
  if (phaseIndex(phase) >= phaseIndex('MODULE_RELOADED')) {
    const reloaded = record(report.moduleReloaded)
    if (!reloaded || reloaded.samePid !== true) throw new Error('hot-reload observer moduleReloaded proof is missing')
    const oldGenerationIds = generationIds(reloaded.oldGenerationIds, 'moduleReloaded.oldGenerationIds')
    const newGenerationIds = generationIds(reloaded.newGenerationIds, 'moduleReloaded.newGenerationIds')
    const hmrEventMatchedGenerationIds = generationIds(
      reloaded.hmrEventMatchedGenerationIds,
      'moduleReloaded.hmrEventMatchedGenerationIds',
    )
    if (JSON.stringify(oldGenerationIds) !== JSON.stringify(targets)) {
      throw new Error('hot-reload observer old generations do not match READY')
    }
    if (newGenerationIds.length !== targets.length) {
      throw new Error('hot-reload observer replacement generation count changed')
    }
    if (newGenerationIds.some(id => targets.includes(id))) {
      throw new Error('hot-reload observer replacement reused an old generation')
    }
    if (JSON.stringify(hmrEventMatchedGenerationIds) !== JSON.stringify(targets)) {
      throw new Error('hot-reload observer public HMR event did not match every READY generation')
    }
    validated.moduleReloaded = {
      at: timestamp(reloaded.at, 'moduleReloaded.at'),
      oldGenerationIds,
      newGenerationIds,
      hmrEventAt: timestamp(reloaded.hmrEventAt, 'moduleReloaded.hmrEventAt'),
      hmrEventMatchedGenerationIds,
      samePid: true,
    }
  }
  if (phaseIndex(phase) >= phaseIndex('HMR_DISPOSED')) {
    const disposed = record(report.hmrDisposed)
    if (!disposed || disposed.generationId !== validated.hmrGenerationId) {
      throw new Error('hot-reload observer HMR disposal does not match the READY generation')
    }
    validated.hmrDisposed = {
      at: timestamp(disposed.at, 'hmrDisposed.at'),
      generationId: disposed.generationId,
    }
  }
  if (phase === 'OBSERVER_DISPOSED') {
    const disposed = record(report.observerDisposed)
    if (!disposed) throw new Error('hot-reload observer disposal proof is missing')
    validated.observerDisposed = { at: timestamp(disposed.at, 'observerDisposed.at') }
  }
  return validated
}

async function waitForReport(
  path: string,
  phase: HotReloadPhase,
  identity: { transactionId: string; pluginId: string; hmrEntryId: string; targetScope: HotReloadScope; pid: number },
  deadline: number,
  sleep: (ms: number) => Promise<void>,
): Promise<ObserverReport> {
  while (Date.now() <= deadline) {
    if (existsSync(path)) {
      const info = lstatSync(path)
      if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600) {
        throw new Error('hot-reload observer report must be one regular 0600 file')
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(readFileSync(path, 'utf8'))
      } catch (error) {
        throw new Error('hot-reload observer report is not valid atomic JSON', { cause: error })
      }
      const report = validateObserverReport(parsed, identity)
      const observed = phaseIndex(report.phase)
      const wanted = phaseIndex(phase)
      if (observed === wanted) return report
      if (observed > wanted) throw new Error(`hot-reload observer skipped ${phase} and reached ${report.phase}`)
    }
    await sleep(25)
  }
  throw new Error(`timed out waiting for hot-reload observer phase ${phase}`)
}

function assertRetainedReport(previous: ObserverReport, next: ObserverReport): void {
  for (const key of ['version', 'transactionId', 'pluginId', 'hmrEntryId', 'targetScope', 'expectedPid', 'pid', 'samePid', 'readyAt', 'hmrGenerationId'] as const) {
    if (next[key] !== previous[key]) throw new Error(`hot-reload observer changed cumulative field ${key}`)
  }
  if (JSON.stringify(next.targetGenerationIds) !== JSON.stringify(previous.targetGenerationIds)) {
    throw new Error('hot-reload observer changed cumulative READY generations')
  }
  if (JSON.stringify(next.targetGenerationStates) !== JSON.stringify(previous.targetGenerationStates)) {
    throw new Error('hot-reload observer changed cumulative READY generation states')
  }
  if (JSON.stringify(next.discoveryAnchor) !== JSON.stringify(previous.discoveryAnchor)) {
    throw new Error('hot-reload observer changed cumulative discovery anchor proof')
  }
  if (previous.moduleReloaded
    && JSON.stringify(next.moduleReloaded) !== JSON.stringify(previous.moduleReloaded)) {
    throw new Error('hot-reload observer changed cumulative reload proof')
  }
  if (previous.hmrDisposed
    && JSON.stringify(next.hmrDisposed) !== JSON.stringify(previous.hmrDisposed)) {
    throw new Error('hot-reload observer changed cumulative HMR disposal proof')
  }
}

function activePatchFiles(home: string, profile: string, host: HostState): string[] {
  const paths = [join(profileDir(home, profile), 'cordis.patch.yml'), join(home, 'cordis.patch.yml')]
  if (host.overlay) paths.push(resolve(host.overlay))
  return [...new Set(paths)]
}

function composedRows(paths: readonly string[]): Map<string, Record<string, unknown>> {
  const rows = new Map<string, Record<string, unknown>>([
    ['hmr', { id: 'hmr', name: HMR_MODULE, disabled: true, config: { root: ['.'] } }],
  ])
  for (const path of paths) {
    if (!existsSync(path)) continue
    for (const value of parsePatch(readFileSync(path, 'utf8'))) {
      const patch = record(value)
      if (!patch) continue
      if (Array.isArray(patch.insert)) {
        for (const inserted of patch.insert) {
          const row = record(inserted)
          if (typeof row?.id !== 'string') continue
          if (rows.has(row.id) && row.id !== 'hmr') throw new Error(`loader id ${row.id} is inserted more than once`)
          rows.set(row.id, { ...row, __patchPath: path })
        }
      }
      if (typeof patch.id === 'string' && rows.has(patch.id)) {
        rows.set(patch.id, { ...rows.get(patch.id), ...patch })
      }
    }
  }
  return rows
}

function inspectExistingHmr(
  rows: Map<string, Record<string, unknown>>,
  packageDir: string,
  entryPath: string,
  root: string,
): void {
  const protectedRoots = ['apps', 'packages', 'vendor'].map(name => resolve(root, name))
  for (const row of rows.values()) {
    if (row.name !== HMR_MODULE || row.disabled === true) continue
    const isolate = record(row.isolate)
    if (isolate?.hmr !== true) {
      throw new Error(`active global HMR row ${String(row.id)} has unbounded ownership; refusing a second module reload scope`)
    }
    const config = record(row.config)
    if (!config || typeof config.base !== 'string' || !Array.isArray(config.root)) {
      throw new Error(`active isolated HMR row ${String(row.id)} has an unprovable watch scope`)
    }
    const base = isAbsolute(config.base)
      ? resolve(config.base)
      : resolve(dirname(String(row.__patchPath ?? root)), config.base)
    for (const item of config.root) {
      if (typeof item !== 'string' || /[*?{}[\]!]/.test(item)) {
        throw new Error(`active isolated HMR row ${String(row.id)} uses an unprovable watch root`)
      }
      const watched = resolve(base, item)
      if (overlaps(watched, packageDir) || overlaps(watched, entryPath)
        || protectedRoots.some(protectedRoot => overlaps(watched, protectedRoot))) {
        throw new Error(`active HMR row ${String(row.id)} already watches the target or shared Harness core`)
      }
    }
  }
}

function packageExportTarget(plugin: PluginManifest): string {
  if (!plugin.runtimePackage) throw new Error(`Loader target ${plugin.id} has no package manifest`)
  const parsed = record(JSON.parse(readFileSync(plugin.runtimePackage.manifestPath, 'utf8')))
  if (!parsed) throw new Error(`package manifest for ${plugin.id} is not an object`)
  const hasExports = parsed.exports !== undefined
  let exported = parsed.exports
  if (record(exported) && Object.keys(record(exported)!).some(key => key.startsWith('.'))) {
    exported = record(exported)?.['.']
  }
  if (hasExports && exported === undefined) {
    throw new Error(`package exports for ${plugin.id} do not expose the package root`)
  }
  if (exported !== undefined) {
    const leaves = new Set<string>()
    const visit = (value: unknown): void => {
      if (typeof value === 'string') leaves.add(value)
      else {
        const object = record(value)
        if (!object) {
          if (value !== null) throw new Error(`package exports for ${plugin.id} use an unsupported array or value`)
          return
        }
        for (const [condition, target] of Object.entries(object)) {
          if (condition === 'types') continue
          if (!['import', 'node', 'node-addons', 'module-sync', 'require', 'default'].includes(condition)) {
            throw new Error(`package exports for ${plugin.id} use unsupported runtime condition ${condition}`)
          }
          visit(target)
        }
      }
    }
    visit(exported)
    if (leaves.size !== 1) {
      throw new Error(`package exports for ${plugin.id} have condition-dependent runtime entries; refusing to guess the Host import target`)
    }
    const target = [...leaves][0]!
    if (!target.startsWith('./')) throw new Error(`package exports target for ${plugin.id} is not package-relative`)
    return target
  }
  if (typeof parsed.main === 'string') {
    if (isAbsolute(parsed.main) || parsed.main.startsWith('../')) {
      throw new Error(`package main for ${plugin.id} is not package-relative`)
    }
    return parsed.main.startsWith('./') ? parsed.main : `./${parsed.main}`
  }
  return './index.js'
}

/** A declared bundle is a candidate only. The in-Host observer must still prove
 * its exact active Loader row, module URL and complete runtime fiber ownership.
 */
function registeredBundlePatch(plugin: PluginManifest, packageDir: string, profile: string): string[] {
  if (!plugin.runtimePackage) return []
  const manifestPath = join(profile, 'package.json')
  if (!existsSync(manifestPath)) return []
  const profileManifest = record(JSON.parse(readFileSync(manifestPath, 'utf8')))
  const bundles = record(record(profileManifest?.dsh)?.profile)?.bundles
  if (!Array.isArray(bundles) || !bundles.includes(plugin.runtimePackage.name)) return []
  const manifest = record(JSON.parse(readFileSync(plugin.runtimePackage.manifestPath, 'utf8')))
  const patch = record(record(manifest?.dsh)?.bundle)?.patch
  if (typeof patch !== 'string' || isAbsolute(patch)) throw new Error('registered bundle needs a package-relative patch')
  const path = canonicalExisting(resolve(packageDir, patch), 'registered bundle patch')
  if (!within(path, packageDir)) throw new Error('registered bundle patch escapes the checked package')
  return [path]
}

function resolveExistingTarget(
  rows: Map<string, Record<string, unknown>>,
  plugin: PluginManifest,
  packageDir: string,
  profile: string,
): ResolvedTarget {
  const direct = rows.get(plugin.id)
  const candidates = [...rows.values()].filter(row => row.name === plugin.runtimePackage?.name && row.disabled !== true)
  if (!direct && candidates.length > 1) throw new Error('root Loader target is ambiguous: multiple rows name the checked package')
  const row = direct ?? candidates[0]
  if (!row || row.disabled === true || typeof row.name !== 'string') {
    throw new Error(`existing active root Loader target ${plugin.id} was not proved; preset-private targets are unsupported`)
  }
  const name = row.name
  let target: string
  if (isAbsolute(name) || name.startsWith('.')) {
    target = canonicalExisting(resolve(profile, name), `Loader target ${plugin.id}`)
  } else {
    const packageName = plugin.runtimePackage?.name ?? plugin.id
    if (name !== packageName && name !== plugin.id) {
      throw new Error(`Loader target ${plugin.id} belongs to unproved module ${name}`)
    }
    const installed = join(profile, 'node_modules', ...name.split('/'))
    if (canonicalExisting(installed, `profile link for ${name}`) !== packageDir) {
      throw new Error(`profile link for ${name} does not resolve to the checked package`)
    }
    const exported = packageExportTarget(plugin)
    if (!exported.startsWith('./')) {
      throw new Error(`package runtime entry for ${plugin.id} is not a package-relative file`)
    }
    target = canonicalExisting(resolve(packageDir, exported), `resolved Loader target ${plugin.id}`)
  }
  if (!within(target, packageDir)) {
    throw new Error(`resolved Loader target ${plugin.id} escapes the checked package`)
  }
  return { entryPath: target, entryId: String(row.id), entryName: name }
}

function resolvePresetTarget(plugin: PluginManifest, packageDir: string, profile: string): ResolvedTarget {
  if (!plugin.runtimePackage) throw new Error(`preset target ${plugin.id} has no package manifest`)
  const name = plugin.runtimePackage.name
  const installed = join(profile, 'node_modules', ...name.split('/'))
  if (canonicalExisting(installed, `profile link for ${name}`) !== packageDir) {
    throw new Error(`profile link for ${name} does not resolve to the checked package`)
  }
  const exported = packageExportTarget(plugin)
  const entryPath = canonicalExisting(resolve(packageDir, exported), `resolved preset target ${plugin.id}`)
  if (!within(entryPath, packageDir)) throw new Error(`resolved preset target ${plugin.id} escapes the checked package`)
  return { entryPath, entryId: '', entryName: name }
}

function artifactStates(plugin: PluginManifest, packageDir: string, runtimeEntry: string): ArtifactState[] {
  const configured = resolveHotReloadArtifacts(packageDir, plugin.entry, plugin.hotReload?.artifacts)
  const runtimeRelative = relative(packageDir, runtimeEntry).split(sep).join('/')
  if (!runtimeRelative || runtimeRelative.startsWith('../') || isAbsolute(runtimeRelative)) {
    throw new Error('resolved runtime entry is not a narrow package-relative artifact')
  }
  const requested = configured.includes(runtimeRelative) ? [...configured] : [...configured, runtimeRelative]
  const artifacts = resolveHotReloadArtifacts(packageDir, plugin.entry, requested)
  if (artifacts.length < 1 || artifacts.length > 32 || new Set(artifacts).size !== artifacts.length) {
    throw new Error('hot reload requires 1 to 32 unique artifacts including the resolved runtime entry')
  }
  return artifacts.map(path => {
    const absolutePath = realpathSync(resolve(packageDir, path))
    if (!within(absolutePath, packageDir)) throw new Error(`hot reload artifact escapes the checked package: ${path}`)
    return { path, absolutePath, before: sha256(absolutePath), mtimeBeforeMs: statSync(absolutePath).mtimeMs }
  })
}

function currentArtifactHashes(artifacts: readonly ArtifactState[]): HotReloadArtifactHash[] {
  return artifacts.map(artifact => ({
    path: artifact.path,
    before: artifact.before,
    after: sha256(artifact.absolutePath),
  }))
}

function assertArtifactBytesUnchanged(artifacts: readonly ArtifactState[], stage: string): HotReloadArtifactHash[] {
  const hashes = currentArtifactHashes(artifacts)
  if (hashes.some(hash => hash.after !== hash.before)) {
    throw new Error(`hot reload artifact bytes changed ${stage}`)
  }
  return hashes
}

function appendManagedBlock(current: string, block: string): string {
  if (MANAGED_MARKER.test(current)) throw new Error('another hot-reload marker already exists in the watched patch')
  const patches = parsePatch(current)
  if (current.trimEnd().endsWith('...')) {
    throw new Error('watched cordis.patch.yml uses an explicit document terminator; refusing a managed append')
  }
  const prefix = patches.length === 0
    ? current.replace(/^([ \t]*)\[[ \t]*\]([ \t]*(?:#[^\r\n]*)?)\r?$/m, '$1$2')
    : current
  const after = prefix.trim() === '' ? block : `${prefix.trimEnd()}\n${block}`
  parsePatch(after)
  return after
}

function ensurePatchList(text: string): string {
  if (parsePatch(text).length > 0) return text
  return text.trim() === '' ? '[]\n' : `${text.trimEnd()}\n[]\n`
}

function replaceManagedBlock(
  path: string,
  expected: string,
  replacement: string,
  writePatch: typeof writeWatchedPatch,
): void {
  if (!existsSync(path)) throw new Error(`watched patch disappeared during hot reload: ${path}`)
  const current = readFileSync(path, 'utf8')
  const first = current.indexOf(expected)
  if (first < 0 || current.indexOf(expected, first + expected.length) >= 0) {
    throw new Error('hot-reload marker was removed, duplicated, or edited; refusing to overwrite concurrent patch changes')
  }
  const next = ensurePatchList(current.slice(0, first) + replacement + current.slice(first + expected.length))
  parsePatch(next)
  writePatch(path, next)
}

function managedBlocks(input: {
  transactionId: string
  pluginId: string
  packageDir: string
  artifactRelatives: string[]
  observerPath: string
  reportPath: string
  expectedEntryUrl: string
  targetScope: HotReloadScope
  targetEntryId: string
  targetEntryName: string
  artifactPaths: string[]
  pid: number
}): ManagedBlocks {
  const suffix = input.transactionId.replaceAll('-', '')
  const hmrEntryId = `dshx-hot-reload-hmr-${suffix}`
  const observerEntryId = `dshx-hot-reload-observer-${suffix}`
  const anchorEntryId = input.targetScope === 'preset' ? `dshx-hot-reload-anchor-${suffix}` : undefined
  const begin = `# dshx hot-reload begin ${input.transactionId}\n`
  const end = `# dshx hot-reload end ${input.transactionId}\n`
  const observer = [
    `    - id: ${JSON.stringify(observerEntryId)}`,
    `      name: ${JSON.stringify(input.observerPath)}`,
    '      config:',
    `        transactionId: ${JSON.stringify(input.transactionId)}`,
    `        pluginId: ${JSON.stringify(input.pluginId)}`,
    `        hmrEntryId: ${JSON.stringify(hmrEntryId)}`,
    `        targetScope: ${JSON.stringify(input.targetScope)}`,
    `        targetEntryId: ${JSON.stringify(anchorEntryId ?? input.targetEntryId)}`,
    `        targetEntryName: ${JSON.stringify(input.targetEntryName)}`,
    '        targetFiles:',
    ...input.artifactPaths.map(path => `          - ${JSON.stringify(path)}`),
    `        reportPath: ${JSON.stringify(input.reportPath)}`,
    `        expectedPid: ${input.pid}`,
    `        expectedEntryUrl: ${JSON.stringify(input.expectedEntryUrl)}`,
  ].join('\n')
  const hmr = [
    `    - id: ${JSON.stringify(hmrEntryId)}`,
    `      name: ${JSON.stringify(HMR_MODULE)}`,
    '      isolate:',
    '        hmr: true',
    '      config:',
    `        base: ${JSON.stringify(input.packageDir)}`,
    '        root:',
    ...input.artifactRelatives.map(path => `          - ${JSON.stringify(path)}`),
    '        ignored: []',
    '        debounce: 50',
  ].join('\n')
  const anchor = anchorEntryId ? [
    `    - id: ${JSON.stringify(anchorEntryId)}`,
    `      name: ${JSON.stringify(input.targetEntryName)}`,
    '      disabled: true',
  ].join('\n') : undefined
  return {
    hmrEntryId,
    observerEntryId,
    ...anchorEntryId ? { anchorEntryId } : {},
    full: `${begin}- insert:\n${anchor ? `${anchor}\n` : ''}${hmr}\n${observer}\n${end}`,
    observerOnly: `${begin}- insert:\n${observer}\n${end}`,
  }
}

async function assertBoundHost(
  root: string,
  home: string,
  port: number,
  expected: BoundHost | undefined,
  deadline: number,
  dependencies: HotReloadDependencies,
): Promise<BoundHost> {
  const canonicalRoot = canonicalExisting(root, 'Harness root')
  const canonicalHome = canonicalExisting(home, 'DSH_HOME')
  const sleep = dependencies.sleep ?? (async ms => await new Promise(resolveSleep => setTimeout(resolveSleep, ms)))
  let boundExpected = expected
  while (true) {
    const host = (dependencies.currentHost ?? currentHost)(root)
    if (!host) {
      throw new Error(boundExpected
        ? 'currentHost identity disappeared while waiting for hot-reload health'
        : 'hot reload requires one existing currentHost; it never starts or adopts a Host')
    }
    if (host.profile !== 'web' || host.port !== port || host.processStartedAt === undefined
      || host.home === undefined || host.hostRoot === undefined
      || canonicalExisting(host.home, 'currentHost home') !== canonicalHome
      || canonicalExisting(host.hostRoot, 'currentHost root') !== canonicalRoot) {
      throw new Error('currentHost identity does not exactly match pid/start/home/profile/root/port')
    }
    const bound: BoundHost = {
      pid: host.pid,
      processStartedAt: host.processStartedAt,
      home: canonicalHome,
      root: canonicalRoot,
      profile: 'web',
      port,
    }
    if (boundExpected && JSON.stringify(bound) !== JSON.stringify(boundExpected)) {
      throw new Error('currentHost identity changed during hot-reload health wait')
    }
    boundExpected ??= bound
    const started = (dependencies.processStart ?? readProcessStartTime)(host.pid)
    if (!started.ok || started.text !== host.processStartedAt) {
      throw new Error(`currentHost process-start identity is unavailable or changed for pid ${host.pid}`)
    }
    const health = await (dependencies.portProbe ?? probePort)(port)
    if (health === 'open') return bound
    if (health === 'closed') throw new Error(`currentHost port ${port} is closed during hot reload`)
    if (Date.now() >= deadline) {
      throw new Error(`currentHost port ${port} health remained unknown until the hot-reload timeout`)
    }
    await sleep(Math.min(25, Math.max(1, deadline - Date.now())))
  }
}

/**
 * Hot-reload one checked, already-active Web server plugin through a temporary
 * isolated official HMR row. This function never installs or controls a Host.
 */
export async function hotReloadPlugin(
  root: string,
  profile: ProfileName,
  pluginId: string,
  port: number,
  timeoutMs: number,
  scopeOrDependencies: HotReloadScope | HotReloadDependencies = 'root',
  providedDependencies: HotReloadDependencies = {},
): Promise<HotReloadPluginResult> {
  const targetScope: HotReloadScope = typeof scopeOrDependencies === 'string' ? scopeOrDependencies : 'root'
  const dependencies = typeof scopeOrDependencies === 'string' ? providedDependencies : scopeOrDependencies
  if (profile !== 'web') throw new Error('hot reload supports only the web profile')
  if (targetScope !== 'root' && targetScope !== 'preset') throw new Error('hot reload scope must be root or preset')
  if (!PLUGIN_ID.test(pluginId)) throw new Error('hot reload requires a lower-case kebab-case plugin id, not a path')
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('hot reload requires a valid Host port')
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('hot reload requires a positive timeout')

  const deadline = Date.now() + timeoutMs
  const home = resolve(dependencies.dshHome ?? resolveDshHome())
  const host = await assertBoundHost(root, home, port, undefined, deadline, dependencies)
  const context = (dependencies.creatorContext ?? readCreatorContext)()
  if (targetScope === 'preset' && context) {
    throw new Error('preset hot reload is external-only and refuses CreatorContext')
  }
  if (context) {
    if (context.hostPid !== host.pid || context.hostPort !== host.port) {
      throw new Error('CreatorContext does not match the bound currentHost')
    }
    assertCreatorClaim(root, pluginId, context)
  }

  const plugin = (dependencies.pluginLoader ?? loadPlugin)(root, pluginId)
  if (plugin.id !== pluginId || plugin.profile !== 'web') {
    throw new Error(`checked plugin identity/profile does not match ${pluginId}/web`)
  }
  const findings = (dependencies.pluginChecker ?? checkPlugin)(plugin, root)
  const errors = findings.filter(finding => finding.level === 'error')
  if (errors.length > 0) {
    throw new Error(`checkPlugin failed before hot reload: ${errors.map(error => `${error.code}: ${error.message}`).join('; ')}`)
  }

  const packageDir = canonicalExisting(plugin.dir, 'plugin package')
  const checkedEntryPath = canonicalExisting(plugin.entryAbs, 'plugin entry')
  const canonicalRoot = host.root
  if (!within(checkedEntryPath, packageDir)) throw new Error('plugin entry escapes the real package directory through a symlink')
  if (packageDir.split(sep).includes('node_modules')) throw new Error('hot reload refuses a package whose real path is inside node_modules')
  for (const protectedName of ['apps', 'packages', 'vendor']) {
    if (overlaps(packageDir, resolve(canonicalRoot, protectedName))) {
      throw new Error(`hot reload refuses shared Harness core under ${protectedName}/`)
    }
  }
  const release = acquireCreatorActivationLock(root, pluginId, context)
  try {
  const prof = profileDir(home, 'web')
  const patchPath = join(prof, 'cordis.patch.yml')
  const hostState = (dependencies.currentHost ?? currentHost)(root)!
  const patchFiles = activePatchFiles(home, 'web', hostState)
  const bundlePatches = targetScope === 'root' ? registeredBundlePatch(plugin, packageDir, prof) : []
  const rows = composedRows([...bundlePatches, ...patchFiles])
  const target = targetScope === 'root'
    ? resolveExistingTarget(rows, plugin, packageDir, prof)
    : resolvePresetTarget(plugin, packageDir, prof)
  const entryPath = target.entryPath
  inspectExistingHmr(rows, packageDir, entryPath, canonicalRoot)
  const artifacts = artifactStates(plugin, packageDir, entryPath)
  const watchRoots = artifacts.map(artifact => artifact.path)

  const observerPath = canonicalExisting(
    dependencies.observerPath ?? fileURLToPath(new URL('../runtime/hot-reload-observer.mjs', import.meta.url)),
    'hot-reload observer',
  )
  if (observerPath === entryPath) throw new Error('hot-reload observer cannot be inside the watched entry path')

  const transactionId = (dependencies.uuid ?? randomUUID)()
  if (!TRANSACTION_ID.test(transactionId)) {
    throw new Error('hot-reload transaction id must be a UUID')
  }
  const reportDir = mkdtempSync(join(tmpdir(), 'dshx-hot-reload-'))
  const reportPath = join(reportDir, 'observer.json')
  const blocks = managedBlocks({
    transactionId,
    pluginId,
    packageDir,
    artifactRelatives: watchRoots,
    observerPath,
    reportPath,
    expectedEntryUrl: pathToFileURL(entryPath).href,
    targetScope,
    targetEntryId: target.entryId,
    targetEntryName: target.entryName,
    artifactPaths: artifacts.map(artifact => artifact.absolutePath),
    pid: host.pid,
  })
  const identity = { transactionId, pluginId, hmrEntryId: blocks.hmrEntryId, targetScope, pid: host.pid }
  // Bind every declared artifact, plus the independently resolved runtime
  // entry, before mounting any watcher. Dependencies are never scanned in.
  const hashBefore = sha256(entryPath)
  const mtimeBeforeMs = statSync(entryPath).mtimeMs
  const writePatch = dependencies.writePatch ?? writeWatchedPatch
  const sleep = dependencies.sleep ?? (async ms => await new Promise(resolveSleep => setTimeout(resolveSleep, ms)))
  const now = dependencies.now ?? Date.now
  const startedAt = new Date(now()).toISOString()
  let journal: HotReloadJournalRecord = {
    version: 1,
    kind: 'server-hot-reload',
    transactionId,
    status: 'running',
    stage: 'prepared',
    startedAt,
    updatedAt: startedAt,
    automaticRecovery: false,
    host: {
      pid: host.pid,
      processStartedAt: host.processStartedAt,
      port: host.port,
      profile: 'web',
      home: host.home,
      root: host.root,
    },
    target: {
      pluginId,
      targetScope,
      sourcePath: packageDir,
      entryPath,
      patchPath,
      hmrEntryId: blocks.hmrEntryId,
      observerEntryId: blocks.observerEntryId,
      watchRoots,
      artifactHashes: artifacts.map(artifact => ({ path: artifact.path, before: artifact.before })),
    },
    cleanup: { marker: 'absent', hmr: 'not-mounted', observer: 'not-mounted', proved: true },
  }
  let journalPath = ''
  const persistJournal = (
    stage: HotReloadJournalStage,
    fields: Partial<Pick<HotReloadJournalRecord, 'status' | 'cleanup' | 'evidence' | 'failure'>> = {},
  ): void => {
    const next = { ...journal, ...fields, stage, updatedAt: new Date(now()).toISOString() }
    const nextPath = writeHotReloadJournal(canonicalRoot, next)
    journal = next
    journalPath = nextPath
  }
  let managedState: 'none' | 'full' | 'observer' = 'none'
  let result: HotReloadPluginResult | undefined
  let failure: unknown
  let cleanupFailure: unknown
  let journalFailure: unknown
  let reportDirectorySafeToRemove = true
  let scopeMutationAttempted = false
  let hmrDisposedProved = false
  let observerDisposedProved = false
  let failureStage: Exclude<HotReloadJournalStage, 'failed' | 'succeeded'> = 'prepared'

  try {
    persistJournal('prepared')
    const current = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
    persistJournal('mounting-scope', {
      cleanup: { marker: 'unknown', hmr: 'unknown', observer: 'unknown', proved: false },
    })
    managedState = 'full'
    scopeMutationAttempted = true
    reportDirectorySafeToRemove = false
    writePatch(patchPath, appendManagedBlock(current, blocks.full))
    persistJournal('waiting-ready', {
      cleanup: { marker: 'full', hmr: 'mounted', observer: 'mounted', proved: false },
    })

    const ready = await waitForReport(reportPath, 'READY', identity, deadline, sleep)
    await assertBoundHost(root, home, port, host, deadline, dependencies)
    assertArtifactBytesUnchanged(artifacts, 'between preflight check and observer READY')
    persistJournal('ready', {
      evidence: {
        ready: {
          at: ready.readyAt,
          targetGenerationIds: ready.targetGenerationIds,
          targetGenerationStates: ready.targetGenerationStates,
          hmrGenerationId: ready.hmrGenerationId,
        },
      },
    })
    const at = new Date(Math.max(now() + 2_000, ...artifacts.map(artifact => artifact.mtimeBeforeMs + 2_000)))
    const touch = dependencies.touch ?? ((path: string, time: Date) => utimesSync(path, time, time))
    persistJournal('trigger-requested')
    for (const artifact of artifacts) touch(artifact.absolutePath, at)
    assertArtifactBytesUnchanged(artifacts, 'while issuing the synchronized utimes trigger')
    persistJournal('waiting-module-reload')

    const moduleReloaded = await waitForReport(reportPath, 'MODULE_RELOADED', identity, deadline, sleep)
    assertRetainedReport(ready, moduleReloaded)
    await assertBoundHost(root, home, port, host, deadline, dependencies)
    const artifactHashes = assertArtifactBytesUnchanged(artifacts, 'during hot reload')
    const hashAfter = sha256(entryPath)
    persistJournal('module-reloaded', {
      evidence: {
        ...journal.evidence,
        moduleReloaded: {
          ...moduleReloaded.moduleReloaded!,
          artifactHashes,
        },
      },
    })

    persistJournal('removing-hmr', {
      cleanup: { marker: 'unknown', hmr: 'removal-requested', observer: 'mounted', proved: false },
    })
    replaceManagedBlock(patchPath, blocks.full, blocks.observerOnly, writePatch)
    managedState = 'observer'
    persistJournal('waiting-hmr-disposed', {
      cleanup: { marker: 'observer-only', hmr: 'removal-requested', observer: 'mounted', proved: false },
    })
    const hmrDisposed = await waitForReport(reportPath, 'HMR_DISPOSED', identity, deadline, sleep)
    assertRetainedReport(moduleReloaded, hmrDisposed)
    await assertBoundHost(root, home, port, host, deadline, dependencies)
    hmrDisposedProved = true
    persistJournal('hmr-disposed', {
      cleanup: { marker: 'observer-only', hmr: 'disposed', observer: 'mounted', proved: false },
      evidence: {
        ...journal.evidence,
        hmrDisposed: hmrDisposed.hmrDisposed!,
      },
    })

    persistJournal('removing-observer', {
      cleanup: { marker: 'unknown', hmr: 'disposed', observer: 'removal-requested', proved: false },
    })
    replaceManagedBlock(patchPath, blocks.observerOnly, '', writePatch)
    managedState = 'none'
    persistJournal('waiting-observer-disposed', {
      cleanup: { marker: 'absent', hmr: 'disposed', observer: 'removal-requested', proved: false },
    })
    const observerDisposed = await waitForReport(reportPath, 'OBSERVER_DISPOSED', identity, deadline, sleep)
    assertRetainedReport(hmrDisposed, observerDisposed)
    await assertBoundHost(root, home, port, host, deadline, dependencies)
    observerDisposedProved = true
    reportDirectorySafeToRemove = true
    const mtimeAfterMs = statSync(entryPath).mtimeMs
    persistJournal('succeeded', {
      status: 'succeeded',
      cleanup: { marker: 'absent', hmr: 'disposed', observer: 'disposed', proved: true },
      evidence: {
        ...journal.evidence,
        observerDisposed: observerDisposed.observerDisposed!,
      },
    })
    result = {
      pluginId,
      profile: 'web',
      hostPid: host.pid,
      hostPort: host.port,
      sourcePath: packageDir,
      entryPath,
      patchPath,
      transactionId,
      hmrEntryId: blocks.hmrEntryId,
      observerEntryId: blocks.observerEntryId,
      ...blocks.anchorEntryId ? { anchorEntryId: blocks.anchorEntryId } : {},
      targetScope,
      watchRoots,
      hostRestart: false,
      journal: {
        path: journalPath,
        status: 'succeeded',
        automaticRecovery: false,
        cleanupProved: true,
      },
      proof: {
        sameHost: true,
        targetScope,
        artifactHashes,
        hashBefore,
        hashAfter,
        bytesUnchanged: true,
        mtimeBeforeMs,
        mtimeAfterMs,
        ready,
        moduleReloaded,
        hmrDisposed,
        observerDisposed,
      },
    }
  } catch (error) {
    failureStage = journal.stage as Exclude<HotReloadJournalStage, 'failed' | 'succeeded'>
    failure = error
  }

  if (managedState !== 'none') {
    try {
      if (managedState === 'full') {
        replaceManagedBlock(patchPath, blocks.full, blocks.observerOnly, writePatch)
        managedState = 'observer'
      }
      if (managedState === 'observer') {
        replaceManagedBlock(patchPath, blocks.observerOnly, '', writePatch)
        managedState = 'none'
      }
    } catch (error) {
      cleanupFailure = error
    }
  }
  if (failure || cleanupFailure) {
    const marker = cleanupFailure
      ? 'unknown' as const
      : managedState === 'full'
        ? 'full' as const
        : managedState === 'observer'
          ? 'observer-only' as const
          : 'absent' as const
    const hmr = hmrDisposedProved
      ? 'disposed' as const
      : scopeMutationAttempted
        ? 'unknown' as const
        : 'not-mounted' as const
    const observer = observerDisposedProved
      ? 'disposed' as const
      : scopeMutationAttempted
        ? 'unknown' as const
        : 'not-mounted' as const
    const cleanup = {
      marker,
      hmr,
      observer,
      proved: marker === 'absent'
        && (hmr === 'disposed' || hmr === 'not-mounted')
        && (observer === 'disposed' || observer === 'not-mounted'),
    }
    try {
      persistJournal('failed', {
        status: 'failed',
        cleanup,
        failure: { at: new Date(now()).toISOString(), code: 'HOT_RELOAD_FAILED', stage: failureStage },
      })
    } catch (error) {
      journalFailure = error
    }
  }
  if (reportDirectorySafeToRemove) rmSync(reportDir, { recursive: true, force: true })

  if (failure || cleanupFailure || journalFailure) {
    const errors = [failure, cleanupFailure, journalFailure].filter((error): error is unknown => error !== undefined)
    const suffix = reportDirectorySafeToRemove ? '' : `; observer report directory preserved at ${reportDir}`
    if (errors.length === 1) throw new Error(`${errors[0] instanceof Error ? errors[0].message : String(errors[0])}${suffix}`, { cause: errors[0] })
    throw new AggregateError(errors, `hot reload failed and exact-marker cleanup also failed${suffix}`)
  }
  return result!
  } finally {
    release()
  }
}
