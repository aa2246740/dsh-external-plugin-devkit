import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import yaml from 'js-yaml'
import { runDsh, type DshResult } from './dsh.ts'
import { parseBootManifest, waitForClientAbsent, writeWatchedPatch } from './new-client.ts'
import { pluginsDir, profileDir, resolveDshHome } from './paths.ts'

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const DISABLE_MARKER = '# dshx bundle-remove '

interface ProfilePackageJson {
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
}

interface DisableMetadata {
  version: 1
  pluginId: string
  createdAt: string
  hostPid: number
  profileRemovedAt?: string
}

interface DisableOverride {
  rowStart: number
  rowEnd: number
  markerStart?: number
  metadata?: DisableMetadata
  canonical: boolean
}

interface PatchInventory {
  override?: DisableOverride
  insertedCount: number
}

export interface WebHostSnapshot {
  pid: number
  startedAtMs?: number
  entryPresent: boolean
}

export interface RemoveProfilePluginResult {
  pluginId: string
  profile: 'web'
  hostPid: number
  hostPort: number
  hostTreeInactive: true
  profileDependencyAction: 'removed' | 'already-absent'
  profileBundleAction: 'removed-by-profile-manager' | 'repaired-leftover' | 'already-absent'
  profileEntryAction: 'removed-by-profile-manager' | 'detached-orphan-symlink' | 'already-absent'
  harnessLinkAction: 'detached' | 'preserved-directory' | 'absent'
  disableAction: 'retained-until-next-boot' | 'removed-after-cold-boot' | 'preserved-user-policy' | 'absent'
  cleanupPending: boolean
  profileDir: string
  patchPath: string
  harnessPath: string
  sourcePath?: string
  sourcePreserved: boolean
  browserReloadRequired: true
  hostRestart: false
}

interface RemoveProfilePluginDependencies {
  dshHome?: string
  now?: () => number
  inspectHost?: (input: { pluginId: string; port: number; timeoutMs: number }) => Promise<WebHostSnapshot>
  waitForClientAbsent?: typeof waitForClientAbsent
  removeProfileDependency?: (input: {
    root: string
    pluginId: string
    timeoutMs: number
  }) => DshResult
}

const jsExpressionType = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  construct: value => value ?? '',
})
const patchSchema = yaml.DEFAULT_SCHEMA.extend([jsExpressionType])

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

function validMetadata(value: unknown, pluginId: string): DisableMetadata | undefined {
  const item = record(value)
  if (item?.version !== 1 || item.pluginId !== pluginId || typeof item.createdAt !== 'string') return undefined
  if (!Number.isInteger(item.hostPid) || Number(item.hostPid) <= 0) return undefined
  if (item.profileRemovedAt !== undefined && typeof item.profileRemovedAt !== 'string') return undefined
  return item as unknown as DisableMetadata
}

function markerBefore(text: string, rowStart: number, pluginId: string): { start: number; metadata: DisableMetadata } | undefined {
  const prefix = text.slice(0, rowStart)
  const match = /(?:^|\n)(# dshx bundle-remove (\{[^\r\n]*\})\r?\n)$/.exec(prefix)
  if (!match) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(match[2]!)
  } catch {
    throw new Error(`malformed DSHX bundle-removal marker for ${pluginId}`)
  }
  const metadata = validMetadata(parsed, pluginId)
  if (!metadata) throw new Error(`invalid DSHX bundle-removal marker for ${pluginId}`)
  const start = match.index + (match[0].startsWith('\n') ? 1 : 0)
  return { start, metadata }
}

function patchInventory(text: string, pluginId: string): PatchInventory {
  const patches = parsePatch(text)
  const targeted = patches.flatMap((value) => {
    const item = record(value)
    return item?.id === pluginId ? [item] : []
  })
  if (targeted.length > 1) throw new Error(`watched patch id ${pluginId} has more than one id-targeted override`)
  if (targeted[0] && targeted[0].disabled !== true) {
    throw new Error(`watched patch id ${pluginId} is an active user override; refusing to replace it with removal policy`)
  }

  let insertedCount = 0
  for (const value of patches) {
    const item = record(value)
    if (!Array.isArray(item?.insert)) continue
    for (const rowValue of item.insert) {
      if (record(rowValue)?.id === pluginId) insertedCount += 1
    }
  }

  let override: DisableOverride | undefined
  const rowPattern = /^- id:[^\r\n]*(?:\r?\n(?:[ \t]+[^\r\n]*(?:\r?\n|$))*)/gm
  for (const match of text.matchAll(rowPattern)) {
    const parsed = parsePatch(match[0])
    const item = parsed.length === 1 ? record(parsed[0]) : undefined
    if (item?.id !== pluginId || item.disabled !== true) continue
    if (override) throw new Error(`watched patch id ${pluginId} has more than one removable disabled override`)
    const marker = markerBefore(text, match.index!, pluginId)
    override = {
      rowStart: match.index!,
      rowEnd: match.index! + match[0].length,
      ...(marker ? { markerStart: marker.start, metadata: marker.metadata } : {}),
      canonical: Object.keys(item).every(key => key === 'id' || key === 'disabled'),
    }
  }
  if (targeted.length === 1 && !override) {
    override = { rowStart: -1, rowEnd: -1, canonical: false }
  }
  return { override, insertedCount }
}

function appendManagedDisable(text: string, pluginId: string, hostPid: number, now: number): string {
  if (text.trimEnd().endsWith('...')) {
    throw new Error('watched cordis.patch.yml uses an explicit document terminator; refusing an unsafe text append')
  }
  const metadata: DisableMetadata = {
    version: 1,
    pluginId,
    createdAt: new Date(now).toISOString(),
    hostPid,
  }
  const block = `${DISABLE_MARKER}${JSON.stringify(metadata)}\n- id: ${JSON.stringify(pluginId)}\n  disabled: true\n`
  if (text.trim() === '' || text.trim() === '[]') return block
  return `${text.trimEnd()}\n${block}`
}

function updateRemovalProof(text: string, override: DisableOverride, profileRemovedAt: number): string {
  if (!override.metadata || override.markerStart === undefined) return text
  const metadata: DisableMetadata = {
    ...override.metadata,
    profileRemovedAt: new Date(profileRemovedAt).toISOString(),
  }
  return text.slice(0, override.markerStart)
    + `${DISABLE_MARKER}${JSON.stringify(metadata)}\n`
    + text.slice(override.rowStart)
}

function removeDisable(text: string, override: DisableOverride): string {
  if (!override.canonical || override.rowStart < 0) return text
  const start = override.markerStart ?? override.rowStart
  return text.slice(0, start) + text.slice(override.rowEnd)
}

function pathEntryExists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

function readManifest(path: string): ProfilePackageJson {
  return JSON.parse(readFileSync(path, 'utf8')) as ProfilePackageJson
}

function writeManifest(path: string, manifest: ProfilePackageJson): void {
  const temporary = join(dirname(path), `.${randomUUID()}.dshx-plugin-remove.tmp`)
  const mode = statSync(path).mode & 0o777
  try {
    writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode })
    renameSync(temporary, path)
    chmodSync(path, mode)
  } finally {
    rmSync(temporary, { force: true })
  }
}

function localSpecTarget(spec: string | undefined, fromDir: string): string | undefined {
  if (spec?.startsWith('link:')) return resolve(fromDir, spec.slice('link:'.length))
  if (spec?.startsWith('file:')) return resolve(fromDir, spec.slice('file:'.length))
  return undefined
}

function resolvedLink(path: string): string {
  return resolve(dirname(path), readlinkSync(path))
}

function pidOnPort(port: number): number {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' })
  const pids = [...new Set(result.stdout.split(/\s+/).filter(Boolean).map(Number).filter(Number.isInteger))]
  if (result.status !== 0 || pids.length !== 1 || pids[0]! <= 0) {
    throw new Error(`cannot prove one Web Host PID on 127.0.0.1:${port}; pass the current DSH Web port`)
  }
  return pids[0]!
}

function processStartedAt(pid: number): number | undefined {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' })
  if (result.status !== 0) return undefined
  const parsed = Date.parse(result.stdout.trim())
  return Number.isFinite(parsed) ? parsed : undefined
}

async function inspectWebHost(input: { pluginId: string; port: number; timeoutMs: number }): Promise<WebHostSnapshot> {
  const url = `http://127.0.0.1:${input.port}/`
  const response = await fetch(url, { signal: AbortSignal.timeout(Math.min(input.timeoutMs, 2_000)) })
  if (!response.ok) throw new Error(`current Web Host on ${url} returned HTTP ${response.status}`)
  const boot = parseBootManifest(await response.text())
  const pid = pidOnPort(input.port)
  return {
    pid,
    startedAtMs: processStartedAt(pid),
    entryPresent: boot.entries?.some(entry => entry.id === input.pluginId) ?? false,
  }
}

function assertSameHost(before: WebHostSnapshot, after: WebHostSnapshot, pluginId: string): void {
  if (after.pid !== before.pid) {
    throw new Error(`Web Host PID changed from ${before.pid} to ${after.pid} while removing ${pluginId}; safe disable was retained and same-PID completion was not claimed`)
  }
  if (after.entryPresent) throw new Error(`HOST_TREE_INACTIVE was not proved for ${pluginId}`)
}

/**
 * Safely remove a profile bundle whose package name is also its Web Loader id.
 * The live row is disabled and proved absent before official package removal.
 * Its temporary disable survives the old boot and is removed only after a
 * later Host is proved to have started from the already-clean profile.
 */
export async function removeProfilePlugin(
  root: string,
  pluginId: string,
  port: number,
  timeoutMs: number,
  dependencies: RemoveProfilePluginDependencies = {},
): Promise<RemoveProfilePluginResult> {
  if (!PACKAGE_NAME.test(pluginId) || pluginId.length > 214) throw new Error('plugin must be a package name, not a path')
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`invalid Web Host port: ${port}`)

  const home = resolve(dependencies.dshHome ?? resolveDshHome())
  const prof = profileDir(home, 'web')
  const manifestPath = join(prof, 'package.json')
  const patchPath = join(prof, 'cordis.patch.yml')
  if (!existsSync(manifestPath)) throw new Error(`Web profile manifest missing: ${manifestPath}`)

  const inspectHost = dependencies.inspectHost ?? inspectWebHost
  const waitAbsent = dependencies.waitForClientAbsent ?? waitForClientAbsent
  const now = dependencies.now ?? Date.now
  const beforeHost = await inspectHost({ pluginId, port, timeoutMs })
  const beforeManifest = readManifest(manifestPath)
  const dependencySpec = beforeManifest.dependencies?.[pluginId]
  const hadDependency = dependencySpec !== undefined
  const hadBundle = beforeManifest.dsh?.profile?.bundles?.includes(pluginId) ?? false
  let patchText = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  let inventory = patchInventory(patchText, pluginId)

  if (inventory.insertedCount > 0) {
    throw new Error(`${pluginId} is present in a watched insert row; use Creator+ safe removal instead of the bundle remover`)
  }
  if (!hadBundle && hadDependency && !inventory.override) {
    throw new Error(`${pluginId} is a profile dependency without boot-captured bundle evidence; refusing to guess its live removal surface`)
  }
  if (hadBundle && hadDependency && !beforeHost.entryPresent && !inventory.override) {
    throw new Error(`${pluginId} is boot-captured, but current __DSH_BOOT__ has no same-name Loader id; refusing to guess this bundle's client-row mapping`)
  }

  const harnessPath = join(pluginsDir(root), pluginId)
  const installedPath = join(prof, 'node_modules', pluginId)
  const hadInstalledEntry = pathEntryExists(installedPath)
  let harnessLinkAction: RemoveProfilePluginResult['harnessLinkAction'] = 'absent'
  let harnessTarget: string | undefined
  if (pathEntryExists(harnessPath)) {
    const info = lstatSync(harnessPath)
    if (info.isSymbolicLink()) {
      harnessTarget = resolvedLink(harnessPath)
      harnessLinkAction = 'detached'
    } else {
      harnessTarget = harnessPath
      harnessLinkAction = 'preserved-directory'
    }
  }
  const dependencyTarget = localSpecTarget(dependencySpec, prof)
  const sourcePath = harnessTarget ?? dependencyTarget

  if (beforeHost.entryPresent && !inventory.override) {
    patchText = appendManagedDisable(patchText, pluginId, beforeHost.pid, now())
    writeWatchedPatch(patchPath, patchText)
    inventory = patchInventory(patchText, pluginId)
  }

  if (beforeHost.entryPresent) {
    const absent = await waitAbsent(pluginId, port, timeoutMs)
    if (!absent) {
      throw new Error(`HOST_TREE_INACTIVE was not proved for ${pluginId}; safe disable was retained and profile/source were not removed`)
    }
  }
  const afterLiveRemoval = await inspectHost({ pluginId, port, timeoutMs })
  assertSameHost(beforeHost, afterLiveRemoval, pluginId)

  let profileDependencyAction: RemoveProfilePluginResult['profileDependencyAction'] = 'already-absent'
  if (hadDependency) {
    const remove = dependencies.removeProfileDependency ?? ((input: { root: string; pluginId: string; timeoutMs: number }) => (
      runDsh(input.root, ['plugin', '--profile', 'web', 'remove', input.pluginId], input.timeoutMs)
    ))
    const result = remove({ root, pluginId, timeoutMs })
    if (result.code !== 0) {
      throw new Error(`live bundle row is inactive, but official dsh plugin remove failed (exit ${result.code}): ${(result.stderr || result.stdout).trim()}`)
    }
    profileDependencyAction = 'removed'
  }

  let currentManifest = readManifest(manifestPath)
  if (currentManifest.dependencies?.[pluginId] !== undefined) {
    throw new Error(`official profile removal left dependency ${pluginId} in ${manifestPath}`)
  }

  let profileBundleAction: RemoveProfilePluginResult['profileBundleAction'] = hadBundle
    ? 'removed-by-profile-manager'
    : 'already-absent'
  if (currentManifest.dsh?.profile?.bundles?.includes(pluginId)) {
    currentManifest.dsh.profile.bundles = currentManifest.dsh.profile.bundles.filter(bundle => bundle !== pluginId)
    writeManifest(manifestPath, currentManifest)
    currentManifest = readManifest(manifestPath)
    if (currentManifest.dsh?.profile?.bundles?.includes(pluginId)) {
      throw new Error(`bounded leftover-bundle repair did not remove ${pluginId} from ${manifestPath}`)
    }
    profileBundleAction = 'repaired-leftover'
  }

  let profileEntryAction: RemoveProfilePluginResult['profileEntryAction'] = hadInstalledEntry
    ? 'removed-by-profile-manager'
    : 'already-absent'
  if (pathEntryExists(installedPath)) {
    const info = lstatSync(installedPath)
    if (!info.isSymbolicLink()) {
      throw new Error(`official profile removal left a non-symlink node_modules entry ${installedPath}; refusing recursive cleanup`)
    }
    const target = resolvedLink(installedPath)
    const allowedTargets = new Set([
      resolve(harnessPath),
      ...(harnessTarget ? [resolve(harnessTarget)] : []),
      ...(dependencyTarget ? [resolve(dependencyTarget)] : []),
    ])
    if (!allowedTargets.has(target)) {
      throw new Error(`official profile removal left node_modules link ${installedPath} pointing outside the plugin's known paths: ${target}`)
    }
    unlinkSync(installedPath)
    profileEntryAction = 'detached-orphan-symlink'
  }

  if (harnessLinkAction === 'detached') unlinkSync(harnessPath)
  const sourcePreserved = sourcePath ? existsSync(sourcePath) : false

  const afterProfileRemoval = await inspectHost({ pluginId, port, timeoutMs })
  assertSameHost(beforeHost, afterProfileRemoval, pluginId)

  patchText = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  inventory = patchInventory(patchText, pluginId)
  const profileRemovedAt = statSync(manifestPath).mtimeMs
  if (inventory.override?.metadata) {
    const withProof = updateRemovalProof(patchText, inventory.override, profileRemovedAt)
    if (withProof !== patchText) {
      writeWatchedPatch(patchPath, withProof)
      patchText = withProof
      inventory = patchInventory(patchText, pluginId)
    }
  }

  let disableAction: RemoveProfilePluginResult['disableAction'] = 'absent'
  let cleanupPending = false
  const override = inventory.override
  if (override) {
    if (!override.canonical) {
      disableAction = 'preserved-user-policy'
    } else {
      const recorded = override.metadata?.profileRemovedAt
      const removalProof = recorded ? Date.parse(recorded) : profileRemovedAt
      const canClean = afterProfileRemoval.startedAtMs !== undefined
        && Number.isFinite(removalProof)
        && afterProfileRemoval.startedAtMs > removalProof
      if (canClean) {
        const beforeCleanup = patchText
        writeWatchedPatch(patchPath, removeDisable(patchText, override))
        const absent = await waitAbsent(pluginId, port, timeoutMs)
        const afterCleanup = await inspectHost({ pluginId, port, timeoutMs })
        if (!absent || afterCleanup.pid !== beforeHost.pid || afterCleanup.entryPresent) {
          writeWatchedPatch(patchPath, beforeCleanup)
          throw new Error(`could not prove ${pluginId} stayed absent after disable cleanup; the safe disable was restored`)
        }
        disableAction = 'removed-after-cold-boot'
      } else {
        disableAction = 'retained-until-next-boot'
        cleanupPending = true
      }
    }
  }

  return {
    pluginId,
    profile: 'web',
    hostPid: beforeHost.pid,
    hostPort: port,
    hostTreeInactive: true,
    profileDependencyAction,
    profileBundleAction,
    profileEntryAction,
    harnessLinkAction,
    disableAction,
    cleanupPending,
    profileDir: prof,
    patchPath,
    harnessPath,
    ...(sourcePath ? { sourcePath } : {}),
    sourcePreserved,
    browserReloadRequired: true,
    hostRestart: false,
  }
}
