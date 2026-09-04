import { randomUUID } from 'node:crypto'
import {
  existsSync,
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import yaml from 'js-yaml'
import { checkPlugin } from './check.ts'
import { runDsh, type DshResult } from './dsh.ts'
import { loadJson, yamlScalar } from './io.ts'
import { profileDir, resolveDshHome } from './paths.ts'
import { loadPlugin } from './plugin.ts'
import type { ProfileName } from './types.ts'

interface PackageJson {
  name?: string
  exports?: Record<string, unknown>
  dsh?: {
    bundle?: unknown
    client?: unknown
    profile?: { bundles?: string[] }
  }
  dependencies?: Record<string, string>
}

interface HostManifestEntry {
  id: string
  url: string
  rev?: string
}

export interface HostManifestProof {
  id: string
  manifestUrl: string
  clientUrl: string
  rev?: string
}

export interface NewClientActivationResult {
  id: string
  packageName: string
  packageDir: string
  profile: ProfileName
  profileDir: string
  dependencySpec: string
  linkAction: 'installed' | 'already-linked'
  patchAction: 'inserted' | 'retriggered'
  patchPath: string
  hostPort: number
  hostEntry: HostManifestProof
}

interface ActivateNewClientDependencies {
  dshHome?: string
  installLink?: (input: {
    root: string
    profile: ProfileName
    packageDir: string
    timeoutMs: number
  }) => DshResult
  verifyHost?: (input: {
    id: string
    port: number
    timeoutMs: number
  }) => Promise<HostManifestProof>
  settleWatchedPatch?: (input: { patchPath: string; id: string }) => Promise<void>
}

export interface WatchedPatchPlan {
  action: 'inserted' | 'retriggered'
  after: string
}

export interface WatchedPatchRemovalPlan {
  action: 'removed' | 'disabled' | 'absent'
  before: string
  current: string
  inactiveReason?: 'not-inserted' | 'already-disabled'
}

const jsExpressionType = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  construct: value => value ?? '',
})
const patchSchema = yaml.DEFAULT_SCHEMA.extend([jsExpressionType])

function parsePatchList(text: string): unknown[] {
  const parsed = yaml.load(text, { schema: patchSchema })
  if (parsed === undefined || parsed === null) return []
  if (!Array.isArray(parsed)) throw new Error('watched cordis.patch.yml must be a top-level YAML array')
  return parsed
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/**
 * Plan one stable Host insertion while preserving the user's YAML bytes,
 * comments, and !!js expressions. Existing matching rows are deliberately
 * rewritten unchanged so a link repaired after an earlier watcher failure is
 * observed again.
 */
export function planWatchedPatch(current: string | undefined, id: string, packageName: string): WatchedPatchPlan {
  const source = current ?? ''
  const patches = parsePatchList(source)
  const inserted: Record<string, unknown>[] = []
  let targeted = false

  for (const patchValue of patches) {
    const patch = record(patchValue)
    if (!patch) continue
    if (patch.id === id) targeted = true
    if (!Array.isArray(patch.insert)) continue
    for (const rowValue of patch.insert) {
      const row = record(rowValue)
      if (row?.id === id) inserted.push(row)
    }
  }

  if (targeted) {
    throw new Error(`watched patch id ${id} is already an id-targeted override; refusing to add a second Host row`)
  }
  if (inserted.length > 1) {
    throw new Error(`watched patch id ${id} is inserted more than once`)
  }
  if (inserted.length === 1) {
    const row = inserted[0]!
    if (row.name !== packageName) {
      throw new Error(`watched patch id ${id} already belongs to ${String(row.name ?? '(missing name)')}`)
    }
    if (row.disabled === true) {
      throw new Error(`watched patch id ${id} is disabled; refusing to silently change user policy`)
    }
    return { action: 'retriggered', after: source }
  }

  if (source.trimEnd().endsWith('...')) {
    throw new Error('watched cordis.patch.yml uses an explicit document terminator; refusing an unsafe text append')
  }
  const insertion = `- insert:\n    - id: ${yamlScalar(id)}\n      name: ${yamlScalar(packageName)}\n`
  if (source.trim() === '' || source.trim() === '[]') return { action: 'inserted', after: insertion }
  return { action: 'inserted', after: `${source.trimEnd()}\n${insertion}` }
}

/**
 * Plan a byte-preserving removal of one standalone insert row. Rows sharing a
 * patch item, user-formatted ambiguous rows, and active id overrides fall back
 * to a later disabled override instead of rewriting user YAML.
 */
export function planWatchedPatchRemoval(current: string | undefined, id: string, packageName: string): WatchedPatchRemovalPlan {
  const source = current ?? ''
  const patches = parsePatchList(source)
  const inserted: Record<string, unknown>[] = []
  let alreadyDisabled = false

  for (const patchValue of patches) {
    const patch = record(patchValue)
    if (!patch) continue
    if (patch.id === id && patch.disabled === true) alreadyDisabled = true
    if (!Array.isArray(patch.insert)) continue
    for (const rowValue of patch.insert) {
      const row = record(rowValue)
      if (row?.id === id) inserted.push(row)
    }
  }

  if (inserted.length > 1) throw new Error(`watched patch id ${id} is inserted more than once`)
  if (inserted.length === 0) {
    return { action: 'absent', before: source, current: source, inactiveReason: alreadyDisabled ? 'already-disabled' : 'not-inserted' }
  }
  if (alreadyDisabled) {
    return { action: 'absent', before: source, current: source, inactiveReason: 'already-disabled' }
  }
  if (inserted[0]!.name !== packageName) {
    throw new Error(`watched patch id ${id} belongs to ${String(inserted[0]!.name ?? '(missing name)')}, not ${packageName}`)
  }

  const removable: Array<{ start: number; end: number }> = []
  const blockPattern = /^- insert:\r?\n(?:[ \t]+.*(?:\r?\n|$))+/gm
  for (const match of source.matchAll(blockPattern)) {
    const block = match[0]
    try {
      const parsed = parsePatchList(block)
      const item = parsed.length === 1 ? record(parsed[0]) : undefined
      const rows = item && Object.keys(item).length === 1 && Array.isArray(item.insert) ? item.insert : undefined
      const row = rows?.length === 1 ? record(rows[0]) : undefined
      if (row?.id === id && row.name === packageName) {
        removable.push({ start: match.index!, end: match.index! + block.length })
      }
    } catch {
      // The full patch already parsed; an isolated nonstandard item is simply
      // not eligible for byte removal and will use a disabled override.
    }
  }
  if (removable.length === 1) {
    const [range] = removable
    return {
      action: 'removed',
      before: source.slice(0, range!.start) + source.slice(range!.end),
      current: source,
    }
  }
  return { action: 'disabled', before: source, current: source }
}

export function disabledWatchedPatch(current: string, id: string): string {
  return `${current.trimEnd()}\n- id: ${yamlScalar(id)}\n  disabled: true\n`
}

export function writeWatchedPatch(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = join(dirname(path), `.${randomUUID()}.dshx-activate.tmp`)
  const mode = existsSync(path) ? statSync(path).mode & 0o777 : 0o600
  try {
    writeFileSync(temporary, content, { mode })
    // The official exact-path HMR contract is exercised with an in-place file
    // change. Renaming a staged inode over the path can be coalesced as an
    // atomic editor save and fail to retrigger a previously rejected row.
    // Stage the complete bytes first, then copy them onto the watched path.
    copyFileSync(temporary, path)
    chmodSync(path, mode)
  } finally {
    rmSync(temporary, { force: true })
  }
}

function localSpecTarget(spec: string, fromDir: string): string | undefined {
  if (spec.startsWith('link:')) return resolve(fromDir, spec.slice('link:'.length))
  if (spec.startsWith('file:')) return resolve(fromDir, spec.slice('file:'.length))
  return undefined
}

function clientExportPath(pkg: PackageJson): string {
  const entry = pkg.exports?.['./client']
  if (typeof entry === 'string') return entry
  if (entry && typeof entry === 'object' && typeof (entry as { default?: unknown }).default === 'string') {
    return (entry as { default: string }).default
  }
  return './lib/client.js'
}

function sameRealPath(first: string, second: string): boolean {
  try {
    return realpathSync(first) === realpathSync(second)
  } catch {
    return resolve(first) === resolve(second)
  }
}

function installedLinkIsReady(prof: string, packageName: string, packageDir: string, clientEntry: string): boolean {
  const installed = join(prof, 'node_modules', packageName)
  return existsSync(join(installed, 'package.json'))
    && existsSync(resolve(installed, clientEntry))
    && sameRealPath(installed, packageDir)
}

// RC8 writes window.__DSH_BOOT__; RC2 writes globalThis["__DSH_BOOT__"].
// Match only the supported assignment surface and parse the value as JSON;
// never evaluate Host-controlled script text.
export const BOOT_MANIFEST_ASSIGNMENT = /(?:window\s*\.\s*__DSH_BOOT__|globalThis(?:\s*\.\s*__DSH_BOOT__|\s*\[\s*["']__DSH_BOOT__["']\s*\]))\s*=\s*/

export function parseBootManifest(html: string): { entries?: HostManifestEntry[] } {
  const assignment = BOOT_MANIFEST_ASSIGNMENT.exec(html)
  if (!assignment) throw new Error('Host HTML has no supported __DSH_BOOT__ manifest assignment')
  const bodyStart = assignment.index + assignment[0].length
  const end = html.indexOf('</script>', bodyStart)
  if (end < 0) throw new Error('Host HTML has an unterminated __DSH_BOOT__ manifest assignment')
  return JSON.parse(html.slice(bodyStart, end).trim().replace(/;$/, '')) as { entries?: HostManifestEntry[] }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms))
}

/** Poll only the loopback Web Host and prove both its graph row and served client artifact. */
export async function verifyClientInHostManifest(id: string, port: number, timeoutMs: number): Promise<HostManifestProof> {
  const manifestUrl = `http://127.0.0.1:${port}/`
  const deadline = Date.now() + timeoutMs
  let last = 'Host did not respond'
  do {
    try {
      const remaining = Math.max(1, deadline - Date.now())
      const response = await fetch(manifestUrl, { signal: AbortSignal.timeout(Math.min(remaining, 2_000)) })
      if (!response.ok) {
        last = `Host returned HTTP ${response.status}`
      } else {
        const boot = parseBootManifest(await response.text())
        const entry = boot.entries?.find(candidate => candidate.id === id)
        if (entry) {
          const clientUrl = new URL(entry.url, manifestUrl).href
          const client = await fetch(clientUrl, { signal: AbortSignal.timeout(Math.min(remaining, 2_000)) })
          if (!client.ok) {
            last = `client entry ${id} returned HTTP ${client.status}`
          } else {
            const artifact = await client.text()
            if (!artifact.includes('__ModuleLoader__.load')) {
              last = `served client entry ${id} is not a DSH lazy-CJS bundle`
            } else {
              return { id, manifestUrl, clientUrl, ...entry.rev ? { rev: entry.rev } : {} }
            }
          }
        } else {
          last = `boot manifest does not contain ${id}`
        }
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    if (Date.now() < deadline) await delay(125)
  } while (Date.now() < deadline)
  throw new Error(`current Web Host on ${manifestUrl} did not activate ${id}: ${last}`)
}

/** Wait until the live Host graph no longer serves one quarantined client entry. */
export async function waitForClientAbsent(id: string, port: number, timeoutMs: number): Promise<boolean> {
  const manifestUrl = `http://127.0.0.1:${port}/`
  const deadline = Date.now() + timeoutMs
  do {
    try {
      const remaining = Math.max(1, deadline - Date.now())
      const response = await fetch(manifestUrl, { signal: AbortSignal.timeout(Math.min(remaining, 2_000)) })
      if (response.ok) {
        const boot = parseBootManifest(await response.text())
        if (!boot.entries?.some(candidate => candidate.id === id)) return true
      }
    } catch {
      // Keep polling: a page reload is safe only after a healthy Host proves absence.
    }
    if (Date.now() < deadline) await delay(125)
  } while (Date.now() < deadline)
  return false
}

/**
 * Safely activate a built, plain external client package in this Web profile.
 * Ordering is contractual: validate -> official profile link -> prove link ->
 * write/retrigger watched patch -> prove current Host manifest. No process
 * control and no browser automation occur here.
 */
export async function activateNewClient(
  root: string,
  profile: ProfileName,
  raw: string,
  port: number,
  timeoutMs: number,
  dependencies: ActivateNewClientDependencies = {},
): Promise<NewClientActivationResult> {
  if (profile !== 'web') throw new Error('activate-new-client supports only the official Web profile')
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`invalid Web Host port: ${port}`)
  const plugin = loadPlugin(root, raw)
  if (plugin.profile !== profile) throw new Error(`${plugin.id} targets profile ${plugin.profile}, not ${profile}`)
  const sourcePackagePath = join(plugin.dir, 'package.json')
  if (!existsSync(sourcePackagePath)) throw new Error(`client package manifest missing: ${sourcePackagePath}`)
  const sourcePackage = loadJson<PackageJson>(sourcePackagePath)
  const packageName = sourcePackage.name
  if (!packageName) throw new Error(`client package has no package.json name: ${sourcePackagePath}`)
  if (packageName !== plugin.id) {
    throw new Error(`dshx id ${plugin.id} must exactly match client package name ${packageName}`)
  }
  if (sourcePackage.dsh?.client === undefined) throw new Error(`${packageName} does not declare dsh.client`)
  if (sourcePackage.dsh?.bundle !== undefined) {
    throw new Error(`${packageName} declares dsh.bundle; use the manifest branch instead of duplicating it in a user patch`)
  }
  const checkErrors = checkPlugin(plugin, root).filter(item => item.level === 'error')
  if (checkErrors.length > 0) {
    throw new Error(`SOURCE_BUILT check failed: ${checkErrors.map(item => `${item.code}: ${item.message}`).join('; ')}`)
  }

  const home = resolve(dependencies.dshHome ?? resolveDshHome())
  const prof = profileDir(home, profile)
  const patchPath = join(prof, 'cordis.patch.yml')
  const patchExisted = existsSync(patchPath)
  const beforePatch = patchExisted ? readFileSync(patchPath, 'utf8') : undefined
  const patchPlan = planWatchedPatch(beforePatch, plugin.id, packageName)

  const profileManifestPath = join(prof, 'package.json')
  const beforeManifest = existsSync(profileManifestPath) ? loadJson<PackageJson>(profileManifestPath) : undefined
  const beforeSpec = beforeManifest?.dependencies?.[packageName]
  if (beforeSpec) {
    const target = localSpecTarget(beforeSpec, prof)
    if (!target || !sameRealPath(target, plugin.dir)) {
      throw new Error(`profile dependency ${packageName} already points to ${beforeSpec}; refusing to replace it`)
    }
  }

  const clientEntry = clientExportPath(sourcePackage)
  let linkAction: NewClientActivationResult['linkAction'] = 'already-linked'
  if (!beforeSpec?.startsWith('link:') || !installedLinkIsReady(prof, packageName, plugin.dir, clientEntry)) {
    const install = dependencies.installLink ?? ((input: { root: string; profile: ProfileName; packageDir: string; timeoutMs: number }) => (
      runDsh(input.root, ['plugin', '--profile', input.profile, 'add', `link:${input.packageDir}`], input.timeoutMs)
    ))
    const installed = install({ root, profile, packageDir: plugin.dir, timeoutMs })
    if (installed.code !== 0) {
      throw new Error(`official dsh plugin link failed (exit ${installed.code}): ${(installed.stderr || installed.stdout).trim()}`)
    }
    linkAction = 'installed'
  }

  if (!existsSync(profileManifestPath)) throw new Error(`profile manifest missing after dsh plugin add: ${profileManifestPath}`)
  const profileManifest = loadJson<PackageJson>(profileManifestPath)
  const dependencySpec = profileManifest.dependencies?.[packageName]
  const dependencyTarget = dependencySpec ? localSpecTarget(dependencySpec, prof) : undefined
  if (!dependencySpec?.startsWith('link:') || !dependencyTarget || !sameRealPath(dependencyTarget, plugin.dir)) {
    throw new Error(`profile did not record a link: dependency for ${packageName}`)
  }
  if ((profileManifest.dsh?.profile?.bundles ?? []).includes(packageName)) {
    throw new Error(`${packageName} is registered as a profile bundle; refusing a duplicate watched-patch mount`)
  }
  if (!installedLinkIsReady(prof, packageName, plugin.dir, clientEntry)) {
    throw new Error(`profile link for ${packageName} does not resolve its built client entry ${clientEntry}`)
  }

  if (patchPlan.action === 'retriggered') {
    // A failed first mount can leave Include's candidate config equal to the
    // on-disk row while the last-good tree still omits it. Rewriting identical
    // YAML then produces no semantic diff and does not retry resolution.
    // Apply a bounded disabled generation first, wait beyond Chokidar's atomic
    // write window, and always restore the user's exact bytes before proving
    // the Host. No temporary control row survives this block.
    writeWatchedPatch(patchPath, disabledWatchedPatch(patchPlan.after, plugin.id))
    try {
      const settle = dependencies.settleWatchedPatch ?? (async () => { await delay(1_500) })
      await settle({ patchPath, id: plugin.id })
    } finally {
      writeWatchedPatch(patchPath, patchPlan.after)
    }
  } else {
    writeWatchedPatch(patchPath, patchPlan.after)
  }
  const verifyHost = dependencies.verifyHost ?? (async (input: { id: string; port: number; timeoutMs: number }) => (
    verifyClientInHostManifest(input.id, input.port, input.timeoutMs)
  ))
  let hostEntry: HostManifestProof
  try {
    hostEntry = await verifyHost({ id: packageName, port, timeoutMs })
  } catch (error) {
    if (patchPlan.action === 'inserted') {
      if (patchExisted) writeWatchedPatch(patchPath, beforePatch!)
      else rmSync(patchPath, { force: true })
      throw new Error(`${error instanceof Error ? error.message : String(error)}; newly inserted watched patch row rolled back`)
    }
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; matching watched row remained inactive after a semantic retrigger. `
      + 'The current Host likely cached an earlier pre-install resolution failure; hand off one controlled Host restart to the external supervisor, then verify the manifest. Creator Mode+ must not restart its own Host.',
    )
  }

  return {
    id: plugin.id,
    packageName,
    packageDir: plugin.dir,
    profile,
    profileDir: prof,
    dependencySpec,
    linkAction,
    patchAction: patchPlan.action,
    patchPath,
    hostPort: port,
    hostEntry,
  }
}
