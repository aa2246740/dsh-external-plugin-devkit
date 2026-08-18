import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { cmdRestart } from './host.ts'
import { runDsh } from '../internal/dsh.ts'
import { newestMtime } from '../internal/file-copy.ts'
import { finding, loadJson, printReport, report } from '../internal/io.ts'
import { profileDir, resolveDshHome } from '../internal/paths.ts'
import { resolveShipTarget } from '../internal/ship.ts'
import type { CliOptions, Finding } from '../internal/types.ts'

interface PackageJson {
  version?: string
}

export async function cmdShip(args: string[], options: CliOptions, root: string): Promise<number> {
  const prof = profileDir(resolveDshHome(), options.profile)
  try {
    const target = resolveShipTarget(root, prof, args[0])
    const findings: Finding[] = [
      finding('ok', 'target', `${target.name} ← ${target.source}`),
    ]
    const removed = runDsh(root, ['plugin', '--profile', options.profile, 'remove', target.name], options.timeoutMs)
    if (removed.code !== 0) {
      findings.push(finding('info', 'remove', `remove exited ${removed.code} (ok if it was not installed)`, {
        hint: (removed.stderr || removed.stdout).trim().slice(0, 300),
      }))
    } else {
      findings.push(finding('ok', 'remove', `removed ${target.name} from profile ${options.profile}`))
    }
    const added = runDsh(root, ['plugin', '--profile', options.profile, 'add', `file:${target.source}`], options.timeoutMs)
    if (added.code !== 0) {
      findings.push(finding('error', 'add', `add file: failed (${added.code})`, {
        hint: (added.stderr || added.stdout).trim().slice(0, 400),
      }))
      printReport(report('ship', findings), options.json)
      return 1
    }
    findings.push(finding('ok', 'add', `added file:${target.source}`))
    const installed = join(prof, 'node_modules', target.name)
    if (!existsSync(join(installed, 'package.json'))) {
      findings.push(finding('error', 'copy', 'profile node_modules copy is missing after add', { path: installed }))
    } else {
      const sourceVer = loadJson<PackageJson>(join(target.source, 'package.json')).version
      const installedVer = loadJson<PackageJson>(join(installed, 'package.json')).version
      const sourceLib = join(target.source, 'lib')
      const installedLib = join(installed, 'lib')
      if (sourceVer !== installedVer) {
        findings.push(finding('error', 'copy', `installed version ${installedVer} != source ${sourceVer}`, { path: installed }))
      } else if (existsSync(sourceLib) && newestMtime(sourceLib) > newestMtime(installedLib) + 1000) {
        findings.push(finding('error', 'copy', 'installed lib/ is still older than the source lib/', {
          path: installed,
          hint: 'pnpm said already-up-to-date; remove then add again, or delete node_modules/<name> by hand',
        }))
      } else {
        findings.push(finding('ok', 'copy', `profile copy is ${installedVer ?? 'unversioned'}`))
      }
    }
    const result = report('ship', findings, { name: target.name, source: target.source })
    printReport(result, options.json)
    if (!result.ok) return 1
    if (options.restart) return cmdRestart([], options, root)
    return 0
  } catch (error) {
    printReport(report('ship', [finding('error', 'usage', error instanceof Error ? error.message : String(error))]), options.json)
    return 1
  }
}
