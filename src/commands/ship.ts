import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { runDsh } from '../internal/dsh.ts'
import { resolveLocalSpec, treeHash } from '../internal/file-copy.ts'
import { finding, loadJson, printReport, report, writeText } from '../internal/io.ts'
import { profileDir, resolveDshHome } from '../internal/paths.ts'
import { preserveBundleOrder, resolveShipTarget } from '../internal/ship.ts'
import type { CliOptions, Finding } from '../internal/types.ts'

interface PackageJson {
  version?: string
  dependencies?: Record<string, string>
  dsh?: {
    profile?: { bundles?: string[] }
  }
}

function restoreBundleOrder(path: string, before: readonly string[], findings: Finding[]): void {
  if (!existsSync(path)) return
  const manifest = loadJson<PackageJson>(path)
  const after = manifest.dsh?.profile?.bundles
  if (!after) return
  const ordered = preserveBundleOrder(before, after)
  if (JSON.stringify(ordered) === JSON.stringify(after)) return
  manifest.dsh ??= {}
  manifest.dsh.profile ??= {}
  manifest.dsh.profile.bundles = ordered
  writeText(path, `${JSON.stringify(manifest, null, 2)}\n`)
  findings.push(finding('ok', 'bundle-order', 'restored the pre-sync dsh.profile.bundles precedence'))
}

function artifactFindings(source: string, installed: string): Finding[] {
  if (!existsSync(join(installed, 'package.json'))) {
    return [finding('error', 'artifact-copy', 'profile package is missing after sync', { path: installed })]
  }
  const sourceVer = loadJson<PackageJson>(join(source, 'package.json')).version
  const installedVer = loadJson<PackageJson>(join(installed, 'package.json')).version
  if (sourceVer !== installedVer) {
    return [finding('error', 'artifact-copy', `installed version ${installedVer} != source ${sourceVer}`, { path: installed })]
  }
  const sourceLib = join(source, 'lib')
  const installedLib = join(installed, 'lib')
  if (existsSync(sourceLib)) {
    const sourceHash = treeHash(sourceLib)
    const installedHash = treeHash(installedLib)
    if (!installedHash || installedHash !== sourceHash) {
      return [finding('error', 'artifact-copy', 'installed lib/ content hash does not match the source lib/', {
        path: installed,
        hint: 'artifact synchronization failed; do not restart or claim live activation',
      })]
    }
    return [finding('ok', 'artifact-copy', `profile artifact hash matches source (${sourceHash?.slice(0, 12)})`)]
  }
  return [finding('ok', 'artifact-copy', `profile package matches version ${installedVer ?? 'unversioned'} (source has no lib/)`)]
}

export async function cmdShip(args: string[], options: CliOptions, root: string): Promise<number> {
  if (options.restart) {
    printReport(report('sync-artifact', [finding('error', 'deprecated-flag', '--restart no longer chains deployment to a host restart', {
      hint: 'run activation-plan --change <surface>; only the server/manifest branch should then use restart-supervised',
    })]), options.json)
    return 1
  }
  const prof = profileDir(resolveDshHome(), options.profile)
  try {
    const target = resolveShipTarget(root, prof, args[0])
    const findings: Finding[] = [
      finding('ok', 'target', `${target.name} ← ${target.source}`),
    ]
    const profileManifestPath = join(prof, 'package.json')
    const before = existsSync(profileManifestPath) ? loadJson<PackageJson>(profileManifestPath) : {}
    const beforeBundles = [...(before.dsh?.profile?.bundles ?? [])]
    const currentSpec = before.dependencies?.[target.name]

    if (currentSpec?.startsWith('link:')) {
      const linked = resolveLocalSpec(currentSpec, prof)
      if (!linked || resolve(linked) !== resolve(target.source)) {
        findings.push(finding('error', 'link-target', `${target.name} already links to ${linked ?? currentSpec}, not ${target.source}`))
      } else {
        findings.push(finding('ok', 'source-link', `${target.name} is already a direct link; no remove/add copy is needed`))
      }
    } else if (currentSpec && !currentSpec.startsWith('file:')) {
      findings.push(finding('error', 'dependency-kind', `${target.name} uses ${currentSpec}; refusing to replace a registry dependency with a local package`))
    } else if (currentSpec?.startsWith('file:')) {
      const removed = runDsh(root, ['plugin', '--profile', options.profile, 'remove', target.name], options.timeoutMs)
      if (removed.code !== 0) {
        findings.push(finding('error', 'remove', `remove exited ${removed.code}; the existing file: package was left in place`, {
          hint: (removed.stderr || removed.stdout).trim().slice(0, 300),
        }))
      } else {
        findings.push(finding('ok', 'remove', `removed stale file: copy of ${target.name}`))
        const added = runDsh(root, ['plugin', '--profile', options.profile, 'add', `file:${target.source}`], options.timeoutMs)
        if (added.code !== 0) {
          findings.push(finding('error', 'add', `add file: failed (${added.code}); attempting rollback`, {
            hint: (added.stderr || added.stdout).trim().slice(0, 400),
          }))
          const rollback = runDsh(root, ['plugin', '--profile', options.profile, 'add', currentSpec], options.timeoutMs)
          findings.push(rollback.code === 0
            ? finding('warn', 'rollback', `restored ${target.name} from its previous ${currentSpec} dependency`)
            : finding('error', 'rollback', `failed to restore ${target.name}; profile needs manual repair`, {
              hint: (rollback.stderr || rollback.stdout).trim().slice(0, 400),
            }))
        } else {
          findings.push(finding('ok', 'file-copy', `re-added file:${target.source}`))
        }
      }
      restoreBundleOrder(profileManifestPath, beforeBundles, findings)
    } else {
      const added = runDsh(root, ['plugin', '--profile', options.profile, 'add', target.source], options.timeoutMs)
      if (added.code !== 0) {
        findings.push(finding('error', 'add', `local package add failed (${added.code})`, {
          hint: (added.stderr || added.stdout).trim().slice(0, 400),
        }))
      } else {
        findings.push(finding('ok', 'source-link', `added local path ${target.source}; official pnpm flow should record a link: dependency`))
      }
    }

    const installed = join(prof, 'node_modules', target.name)
    if (!findings.some(item => item.level === 'error')) findings.push(...artifactFindings(target.source, installed))
    if (!findings.some(item => item.level === 'error')) {
      findings.push(finding('warn', 'activation-state', 'ARTIFACT_SYNCED; LIVE_ACTIVATION_UNPROVEN', {
        hint: `run dshx activation-plan ${target.name} --change <surface>`,
      }))
    }
    const result = report('sync-artifact', findings, {
      name: target.name,
      source: target.source,
      artifactState: resultState(findings),
      liveActivation: 'unproven',
    })
    printReport(result, options.json)
    return result.ok ? 0 : 1
  } catch (error) {
    printReport(report('sync-artifact', [finding('error', 'usage', error instanceof Error ? error.message : String(error))]), options.json)
    return 1
  }
}

function resultState(findings: readonly Finding[]): 'synced' | 'failed' {
  return findings.some(item => item.level === 'error') ? 'failed' : 'synced'
}
