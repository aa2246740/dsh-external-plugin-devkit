import { checkPlugin } from '../internal/check.ts'
import { finding, printReport, report } from '../internal/io.ts'
import { listPluginNames, loadPlugin } from '../internal/plugin.ts'
import type { CliOptions } from '../internal/types.ts'

export function cmdCheck(args: string[], options: CliOptions, root: string): number {
  const names = args[0] ? [args[0]] : listPluginNames(root)
  if (names.length === 0) {
    printReport(report('check', [finding('error', 'none', 'no plugins under my-plugins/')]), options.json)
    return 1
  }
  const findings = names.flatMap(name => {
    try {
      return checkPlugin(loadPlugin(root, name), root)
    } catch (error) {
      return [finding('error', 'load', error instanceof Error ? error.message : String(error))]
    }
  })
  if (!args[0] && names.length > 1) {
    findings.unshift(finding('info', 'scope', `checking ${names.length} plugins (${names.join(', ')}). pass a name to check one.`))
  }
  const result = report('check', findings, { plugins: names })
  printReport(result, options.json)
  return result.ok ? 0 : 1
}
