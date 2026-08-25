import { finding, printReport, report } from '../internal/io.ts'
import { dshEnv } from '../internal/dsh.ts'
import { writeOverlay } from '../internal/overlay.ts'
import { resolveDshHome } from '../internal/paths.ts'
import { loadPlugin, runtimePluginSpecifier } from '../internal/plugin.ts'
import { ensureRuntimePackageLink } from '../internal/runtime-package.ts'
import type { CliOptions } from '../internal/types.ts'

export function cmdOverlay(args: string[], options: CliOptions, root: string): number {
  try {
    const plugin = loadPlugin(root, args[0])
    const linked = ensureRuntimePackageLink(plugin, resolveDshHome(dshEnv(root)), options.profile)
    const path = writeOverlay(root, plugin)
    const result = report('overlay', [
      finding('ok', 'overlay', linked
        ? `wrote package-name --patch and linked ${linked.name} into profile ${options.profile}`
        : 'wrote machine-local absolute --patch file (do not commit)'),
    ], { path, id: plugin.id, entry: runtimePluginSpecifier(plugin), link: linked?.link })
    printReport(result, options.json)
    return 0
  } catch (error) {
    printReport(report('overlay', [finding('error', 'overlay', error instanceof Error ? error.message : String(error))]), options.json)
    return 1
  }
}
