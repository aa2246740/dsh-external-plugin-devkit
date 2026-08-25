import { dshEnv, dumpConfig, dumpDefaultConfig, duplicateIds, parseDumpEntries } from '../internal/dsh.ts'
import { finding, printReport, report } from '../internal/io.ts'
import { writeOverlay } from '../internal/overlay.ts'
import { resolveDshHome } from '../internal/paths.ts'
import { loadPlugin } from '../internal/plugin.ts'
import { ensureRuntimePackageLink } from '../internal/runtime-package.ts'
import type { CliOptions } from '../internal/types.ts'

export function cmdDump(args: string[], options: CliOptions, root: string): number {
  const patches: string[] = []
  let pluginId: string | undefined
  if (args[0] && args[0] !== '--default') {
    try {
      const plugin = loadPlugin(root, args[0])
      ensureRuntimePackageLink(plugin, resolveDshHome(dshEnv(root)), options.profile)
      patches.push(writeOverlay(root, plugin))
      pluginId = plugin.id
    } catch (error) {
      printReport(report('dump', [finding('error', 'plugin', error instanceof Error ? error.message : String(error))]), options.json)
      return 1
    }
  }
  const dumped = args.includes('--default') && patches.length === 0
    ? dumpDefaultConfig(root, options.profile)
    : dumpConfig(root, options.profile, patches)
  const entries = dumped.code === 0 ? parseDumpEntries(dumped.stdout) : []
  const dups = duplicateIds(entries)
  const findings = [
    dumped.code === 0
      ? finding('ok', 'dump-config', `dump-config exited 0 with ${entries.length} rows`)
      : finding('error', 'dump-config', `dump-config exited ${dumped.code}`),
    finding('warn', 'not-boot', 'dump-config does not mount the Loader. exit 0 is not a boot proof. use dshx verify-boot for an isolated cold boot.'),
  ]
  if (dups.length > 0) {
    findings.push(finding('error', 'duplicate-id', `composed tree repeats id: ${dups.join(', ')}`))
  }
  if (pluginId) {
    const hit = entries.find(entry => entry.id === pluginId)
    findings.push(hit
      ? finding('ok', 'plugin-id', `id ${pluginId} is in the composed tree`, { path: hit.name })
      : finding('error', 'plugin-id', `id ${pluginId} is missing from dump-config`))
  }
  const result = report('dump', findings, options.json
    ? { ids: entries.map(entry => entry.id), stderr: dumped.stderr }
    : { hint: `full YAML not printed unless --json; use pnpm dsh --profile ${options.profile} --dump-config to see it` })
  printReport(result, options.json)
  if (!options.json && dumped.code === 0 && pluginId) {
    const hit = entries.find(entry => entry.id === pluginId)
    if (hit) process.stdout.write(`entry: id=${hit.id} name=${hit.name ?? ''} source=${hit.source ?? ''}\n`)
  }
  if (dumped.code !== 0 && !options.json) process.stderr.write(dumped.stderr)
  return result.ok ? 0 : 1
}
