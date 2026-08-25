import { existsSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { dumpConfig, parseDumpEntries } from './dsh.ts'
import { currentHost } from './host.ts'
import { loadJson, loadYaml } from './io.ts'
import { profileDir, resolveDshHome } from './paths.ts'
import { loadPlugin } from './plugin.ts'
import type { ActivationChange, PluginManifest, ProfileName } from './types.ts'

interface PackageJson {
  name?: string
  dependencies?: Record<string, string>
  exports?: Record<string, unknown>
  dsh?: {
    bundle?: unknown
    client?: unknown
    profile?: { bundles?: string[] }
  }
}

export interface ActivationFacts {
  id: string
  packageName: string
  packageDir: string
  dependencySpec?: string
  bundleDeclared: boolean
  bundleRegistered: boolean
  hasClient: boolean
  profilePatchEntry: boolean
  homePatchEntry: boolean
  inOfflineComposition: boolean
  compositionSource?: string
  packageResolvable: boolean
  supervisedPid?: number
  supervisedProfile?: ProfileName
  dumpError?: string
}

export interface ActivationDecision {
  method: string
  hostRestart: 'required' | 'not-required' | 'not-decided'
  restartReason: string
  browserReload: 'required' | 'not-required' | 'conditional' | 'not-decided'
  blockers: string[]
  preconditions: string[]
  proof: string[]
}

const CHANGES = new Set<ActivationChange>(['patch', 'manifest', 'preset', 'client', 'new-client', 'server', 'artifact'])

export function isActivationChange(value: string | undefined): value is ActivationChange {
  return value !== undefined && CHANGES.has(value as ActivationChange)
}

function packageAt(dir: string): PackageJson | undefined {
  const path = join(dir, 'package.json')
  return existsSync(path) ? loadJson<PackageJson>(path) : undefined
}

function tryPlugin(root: string, raw: string): PluginManifest | undefined {
  try {
    return loadPlugin(root, raw)
  } catch {
    return undefined
  }
}

function resolveTarget(root: string, profile: string, raw: string): {
  id: string
  packageName: string
  dir: string
  plugin?: PluginManifest
  pkg?: PackageJson
} {
  const plugin = tryPlugin(root, raw)
  if (plugin) {
    const pkg = packageAt(plugin.dir)
    return {
      id: plugin.id,
      packageName: pkg?.name ?? plugin.id,
      dir: plugin.dir,
      plugin,
      pkg,
    }
  }

  const direct = resolve(raw)
  if (existsSync(join(direct, 'package.json'))) {
    const pkg = packageAt(direct)!
    return { id: pkg.name ?? basename(direct), packageName: pkg.name ?? basename(direct), dir: direct, pkg }
  }

  const installed = join(profile, 'node_modules', raw)
  if (existsSync(join(installed, 'package.json'))) {
    const pkg = packageAt(installed)!
    return { id: pkg.name ?? raw, packageName: pkg.name ?? raw, dir: installed, pkg }
  }

  throw new Error(`cannot resolve ${raw} as a scratch plugin, package directory, or installed profile package`)
}

function patchIds(path: string): Set<string> {
  if (!existsSync(path)) return new Set()
  const parsed = loadYaml(readFileSync(path, 'utf8'))
  if (!Array.isArray(parsed)) return new Set()
  const ids = new Set<string>()
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const row = item as { id?: unknown; insert?: unknown }
    if (typeof row.id === 'string') ids.add(row.id)
    if (!Array.isArray(row.insert)) continue
    for (const inserted of row.insert) {
      if (inserted && typeof inserted === 'object' && typeof (inserted as { id?: unknown }).id === 'string') {
        ids.add((inserted as { id: string }).id)
      }
    }
  }
  return ids
}

export function inspectActivation(root: string, profile: ProfileName, raw: string): ActivationFacts {
  const home = resolveDshHome()
  const prof = profileDir(home, profile)
  const target = resolveTarget(root, prof, raw)
  const profileManifest = packageAt(prof)
  const dependencySpec = profileManifest?.dependencies?.[target.packageName]
  const profilePatch = join(prof, 'cordis.patch.yml')
  const homePatch = join(home, 'cordis.patch.yml')
  const dumped = dumpConfig(root, profile)
  const entries = dumped.code === 0 ? parseDumpEntries(dumped.stdout) : []
  const composed = entries.find(entry => entry.id === target.id || entry.name === target.packageName)
  const host = currentHost(root)
  const packageResolvable = existsSync(join(prof, 'node_modules', target.packageName))
    || existsSync(join(target.dir, 'package.json'))
    || Boolean(target.plugin?.entryAbs && existsSync(target.plugin.entryAbs))

  return {
    id: target.id,
    packageName: target.packageName,
    packageDir: target.dir,
    dependencySpec,
    bundleDeclared: target.pkg?.dsh?.bundle !== undefined,
    bundleRegistered: (profileManifest?.dsh?.profile?.bundles ?? []).includes(target.packageName),
    hasClient: target.pkg?.dsh?.client !== undefined || target.pkg?.exports?.['./client'] !== undefined,
    profilePatchEntry: patchIds(profilePatch).has(target.id),
    homePatchEntry: patchIds(homePatch).has(target.id),
    inOfflineComposition: composed !== undefined,
    compositionSource: composed?.source,
    packageResolvable,
    supervisedPid: host?.pid,
    supervisedProfile: host?.profile,
    ...dumped.code === 0 ? {} : { dumpError: (dumped.stderr || dumped.stdout || `exit ${dumped.code}`).trim().slice(0, 400) },
  }
}

export function activationDecision(change: ActivationChange, facts: Pick<ActivationFacts, 'bundleDeclared' | 'bundleRegistered' | 'hasClient' | 'inOfflineComposition' | 'packageResolvable'>): ActivationDecision {
  if (change === 'patch') {
    return {
      method: 'watched cordis.patch.yml reconciliation',
      hostRestart: 'not-required',
      restartReason: 'the watched patch reconciles inside the current Host process',
      browserReload: facts.hasClient ? 'conditional' : 'not-required',
      blockers: facts.packageResolvable ? [] : ['plugin module is not resolvable from the active profile'],
      preconditions: ['edit the active profile/home cordis.patch.yml with a stable loader id', 'the plugin module must resolve from the active profile'],
      proof: ['DSH pid stays unchanged', 'host inventory or a plugin-owned marker proves the entry mounted/disposed', 'a newly added client entry still needs the browser page reloaded'],
    }
  }
  if (change === 'manifest') {
    if (!facts.bundleDeclared && !facts.bundleRegistered) {
      return {
        method: 'plain profile dependency state; no boot-captured bundle change is established',
        hostRestart: 'not-required',
        restartReason: 'a dependency link alone is not a running Loader change or a Host restart reason',
        browserReload: 'not-required',
        blockers: [
          'manifest branch requires boot-captured bundle evidence: a package dsh.bundle declaration or an existing dsh.profile.bundles row',
        ],
        preconditions: [
          'select the branch by the runtime surface, not by prerequisite files a command writes',
          'use new-client for a first Web client; activate-new-client owns its profile dependency link',
          'use patch for a watched Loader row, client for an existing browser entry, or artifact for bytes/dependency-only work',
        ],
        proof: ['keep the current DSH pid unchanged; no live activation or deactivation is claimed by a plain dependency edit'],
      }
    }
    return {
      method: 'boot-captured dsh.profile.bundles / package dsh.bundle composition for the next boot',
      hostRestart: 'required',
      restartReason: 'the selected bundle composition is captured only when the Host boots',
      browserReload: facts.hasClient ? 'required' : 'not-required',
      blockers: [],
      preconditions: ['package installation and bundle ordering complete without duplicate loader ids'],
      proof: ['profile manifest records the dependency/bundle', 'a new host boot contains the entry', 'verify browser behavior separately for client packages'],
    }
  }
  if (change === 'preset') {
    return {
      method: 'user-preset discovery, then a new session generation',
      hostRestart: 'not-required',
      restartReason: 'the preset roster is rediscovered without replacing the Host process',
      browserReload: 'conditional',
      blockers: facts.packageResolvable ? [] : ['a package referenced by the preset is not resolvable from the active profile'],
      preconditions: [
        'write a new id under the user preset root; never edit the shipped preset directory',
        'install every package named by the preset as a plain profile dependency',
      ],
      proof: [
        'the official WebUI roster lists the user preset',
        'start or switch a blank session to the preset; an already-started session keeps its recorded generation',
        'invoke one preset-owned tool or observe one preset-owned prompt contribution in that new session',
        'reload/reopen the WebUI only when its already-loaded roster does not refresh',
      ],
    }
  }
  if (change === 'client') {
    return {
      method: 'existing client entry bundle HMR after lib/client.js changes',
      hostRestart: 'not-required',
      restartReason: 'client HMR replaces the existing browser entry while the Host pid stays stable',
      browserReload: 'not-required',
      blockers: [
        ...facts.hasClient ? [] : ['target package does not declare a client entry'],
        ...facts.inOfflineComposition ? [] : ['target is not in the composed profile; it is not an existing client entry'],
      ],
      preconditions: [
        'the client entry is already in this browser page loader tree',
        'the built lazy-CJS lib/client.js changes and client HMR is active',
      ],
      proof: ['client HMR emits rebuilt for this id', 'the same page shows the new UI/behavior', 'expect plugin React-local state to reset; failed reload has no automatic rollback'],
    }
  }
  if (change === 'new-client') {
    return {
      method: 'watched host patch activation, then browser page reload for a new client graph row',
      hostRestart: 'not-required',
      restartReason: 'the Host row hot-mounts through the watched patch; only the page boot graph is stale',
      browserReload: 'required',
      blockers: [
        ...facts.hasClient ? [] : ['target package does not declare a client entry'],
        ...facts.packageResolvable ? [] : ['target package is not currently resolvable'],
      ],
      preconditions: [
        'activate-new-client installs the profile dependency as a resolution prerequisite; that write does not make this a manifest branch',
        'add a stable profile/home patch entry without also mounting the same bundle twice',
        'the package and built client entry resolve from the active profile',
      ],
      proof: ['host entry becomes active with the same DSH pid', 'reload/reopen the page', 'the new boot manifest and visible UI/behavior prove the client loaded'],
    }
  }
  if (change === 'server') {
    return {
      method: 'controlled restart of the currently supervised host',
      hostRestart: 'required',
      restartReason: 'the selected server module has no explicit, tested module-HMR path in the Web composition',
      browserReload: facts.hasClient ? 'conditional' : 'not-required',
      blockers: [],
      preconditions: ['restart is the safe default unless this exact server module has explicit, tested module-HMR coverage'],
      proof: ['record the old and new pid', 'post-boot marker and behavior pass', 'do not infer current activation from an artifact copy'],
    }
  }
  return {
    method: 'artifact synchronization only',
    hostRestart: 'not-required',
    restartReason: 'copying bytes or changing a plain dependency does not itself change the running Loader',
    browserReload: 'not-required',
    blockers: [],
    preconditions: ['choose a separate activation branch after the artifact is built or copied'],
    proof: ['ARTIFACT_SYNCED is not LIVE_ACTIVATION_PROVEN', 'keep the current DSH pid unchanged until another branch supplies explicit restart evidence'],
  }
}
