import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  rmSync,
  unlinkSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  assertCreatorClaim,
  creatorQuarantine,
  discardCreatorQuarantine,
  quarantineClaimedPlugin,
  type CreatorContext,
} from './creator.ts'
import { runDsh, type DshResult } from './dsh.ts'
import { planWatchedPatchRemoval, waitForClientAbsent } from './new-client.ts'
import { pluginsDir, profileDir, resolveDshHome } from './paths.ts'

const PROTECTED_PLUGIN_IDS = new Set([
  'dsh-creator-mode-plus',
  'dsh-external-plugin-devkit',
  'dshx-creator-plus',
])

interface PackageJson {
  dependencies?: Record<string, string>
}

export interface RemoveCreatorPluginResult {
  pluginId: string
  hostPid: number
  hostPort: number
  hostTreeInactive: true
  patchAction: 'removed' | 'disabled' | 'already-absent'
  profileDependencyAction: 'removed' | 'already-absent'
  profileEntryAction: 'removed-by-profile-manager' | 'detached-orphan-symlink' | 'already-absent'
  profileDir: string
  harnessPath: string
  harnessLinkAction: 'detached' | 'preserved-directory' | 'absent'
  sourcePath?: string
  sourcePreserved: boolean
  hostRestart: false
}

interface RemoveDependencies {
  dshHome?: string
  now?: () => number
  waitForClientAbsent?: typeof waitForClientAbsent
  removeProfileDependency?: (input: {
    root: string
    pluginId: string
    timeoutMs: number
  }) => DshResult
}

function pathEntryExists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

function packageJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageJson
}

function sourceLocation(root: string, pluginId: string, context: CreatorContext) {
  const harnessPath = join(pluginsDir(root), pluginId)
  if (pathEntryExists(harnessPath)) {
    const info = lstatSync(harnessPath)
    if (info.isSymbolicLink()) {
      return {
        harnessPath,
        sourcePath: resolve(dirname(harnessPath), readlinkSync(harnessPath)),
        harnessLinkAction: 'detached' as const,
      }
    }
    return {
      harnessPath,
      sourcePath: harnessPath,
      harnessLinkAction: 'preserved-directory' as const,
    }
  }
  const workspaceCandidate = context.workspaceRoot ? join(context.workspaceRoot, pluginId) : undefined
  return {
    harnessPath,
    ...workspaceCandidate ? { sourcePath: workspaceCandidate } : {},
    harnessLinkAction: 'absent' as const,
  }
}

/**
 * Safely deactivate and unregister a claimed Web client. Contractual order:
 * live patch quarantine -> same-Host absence proof -> official profile remove
 * -> dependency/link proof -> detach only the Harness symlink. Source is never
 * recursively removed.
 */
export async function removeCreatorPlugin(
  root: string,
  pluginId: string,
  context: CreatorContext,
  timeoutMs: number,
  dependencies: RemoveDependencies = {},
): Promise<RemoveCreatorPluginResult> {
  if (PROTECTED_PLUGIN_IDS.has(pluginId)) {
    throw new Error(`${pluginId} is Creator infrastructure; remove or upgrade its preset only from the external supervisor`)
  }
  const claim = assertCreatorClaim(root, pluginId, context)
  const home = resolve(dependencies.dshHome ?? resolveDshHome())
  const prof = profileDir(home, 'web')
  const patchPath = join(prof, 'cordis.patch.yml')
  const manifestPath = join(prof, 'package.json')
  if (!existsSync(manifestPath)) throw new Error(`Web profile manifest missing: ${manifestPath}`)
  const installedPath = join(prof, 'node_modules', pluginId)
  const hadDependency = packageJson(manifestPath).dependencies?.[pluginId] !== undefined
  const hadInstalledEntry = pathEntryExists(installedPath)
  const priorQuarantine = creatorQuarantine(root, pluginId)
  const patchPlan = planWatchedPatchRemoval(
    existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : undefined,
    pluginId,
    pluginId,
  )
  if (patchPlan.action === 'absent'
    && patchPlan.inactiveReason === 'not-inserted'
    && (hadDependency || hadInstalledEntry)
    && priorQuarantine === undefined) {
    throw new Error(`${pluginId} has a Web profile dependency but no bounded watched-client row; classify its manifest/server removal and hand process control to the external supervisor`)
  }
  const source = sourceLocation(root, pluginId, context)
  const quarantined = quarantineClaimedPlugin(
    root,
    claim,
    patchPath,
    context.hostPid,
    context.hostPort,
    'explicit safe plugin removal',
    (dependencies.now ?? Date.now)(),
  )
  const absent = await (dependencies.waitForClientAbsent ?? waitForClientAbsent)(
    pluginId,
    context.hostPort,
    timeoutMs,
  )
  if (!absent) {
    throw new Error(`HOST_TREE_INACTIVE was not proved for ${pluginId}; its patch row is quarantined, profile dependency and source were preserved`)
  }

  let profileDependencyAction: RemoveCreatorPluginResult['profileDependencyAction'] = 'already-absent'
  if (hadDependency) {
    const remove = dependencies.removeProfileDependency ?? ((input: { root: string; pluginId: string; timeoutMs: number }) => (
      runDsh(input.root, ['plugin', '--profile', 'web', 'remove', input.pluginId], input.timeoutMs)
    ))
    const result = remove({ root, pluginId, timeoutMs })
    if (result.code !== 0) {
      throw new Error(`live row is quarantined, but official dsh plugin remove failed (exit ${result.code}): ${(result.stderr || result.stdout).trim()}`)
    }
    profileDependencyAction = 'removed'
  }

  if (packageJson(manifestPath).dependencies?.[pluginId] !== undefined) {
    throw new Error(`official profile removal left dependency ${pluginId} in ${manifestPath}`)
  }

  let profileEntryAction: RemoveCreatorPluginResult['profileEntryAction'] = hadInstalledEntry
    ? 'removed-by-profile-manager'
    : 'already-absent'
  if (pathEntryExists(installedPath)) {
    const installedInfo = lstatSync(installedPath)
    if (!installedInfo.isSymbolicLink()) {
      throw new Error(`official profile removal left a non-symlink node_modules entry ${installedPath}; refusing recursive cleanup`)
    }
    const installedTarget = resolve(dirname(installedPath), readlinkSync(installedPath))
    const allowedTargets = new Set([
      resolve(source.harnessPath),
      ...(source.sourcePath ? [resolve(source.sourcePath)] : []),
    ])
    if (!allowedTargets.has(installedTarget)) {
      throw new Error(`official profile removal left node_modules link ${installedPath} pointing outside the claimed plugin paths: ${installedTarget}`)
    }
    unlinkSync(installedPath)
    if (pathEntryExists(installedPath)) {
      throw new Error(`bounded cleanup could not detach the orphan profile symlink ${installedPath}`)
    }
    profileEntryAction = 'detached-orphan-symlink'
  }

  if (source.harnessLinkAction === 'detached') rmSync(source.harnessPath, { force: true })
  const sourcePreserved = source.sourcePath ? existsSync(source.sourcePath) : false
  discardCreatorQuarantine(root, pluginId)
  return {
    pluginId,
    hostPid: context.hostPid,
    hostPort: context.hostPort,
    hostTreeInactive: true,
    patchAction: quarantined?.quarantine.mode ?? priorQuarantine?.mode ?? 'already-absent',
    profileDependencyAction,
    profileEntryAction,
    profileDir: prof,
    harnessPath: source.harnessPath,
    harnessLinkAction: source.harnessLinkAction,
    ...source.sourcePath ? { sourcePath: source.sourcePath } : {},
    sourcePreserved,
    hostRestart: false,
  }
}

/** True when one claimed watched client can no longer resolve in the profile. */
export function claimedPluginIntegrityFailure(
  root: string,
  pluginId: string,
  dshHome = resolveDshHome(),
): { patchPath: string; installedPath: string } | undefined {
  const prof = profileDir(resolve(dshHome), 'web')
  const patchPath = join(prof, 'cordis.patch.yml')
  if (!existsSync(patchPath)) return undefined
  let plan
  try {
    plan = planWatchedPatchRemoval(readFileSync(patchPath, 'utf8'), pluginId, pluginId)
  } catch {
    return undefined
  }
  if (plan.action === 'absent') return undefined
  const installedPath = join(prof, 'node_modules', pluginId)
  if (existsSync(join(installedPath, 'package.json'))) return undefined
  return { patchPath, installedPath }
}
