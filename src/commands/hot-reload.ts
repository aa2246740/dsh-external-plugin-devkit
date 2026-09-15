import { hotReloadPlugin } from '../internal/hot-reload.ts'
import { finding, printReport, report } from '../internal/io.ts'
import type { CliOptions } from '../internal/types.ts'

/** Explicit replacement of one checked server module; never process control. */
export async function cmdHotReload(args: string[], options: CliOptions, root: string): Promise<number> {
  if (args.length !== 1 || !/^[a-z][a-z0-9-]*$/.test(args[0]!)) {
    printReport(report('hot-reload', [finding('error', 'usage', 'dshx hot-reload <plugin-id> --scope root|preset|mixed --profile web --port <current-web-port>')]), options.json)
    return 1
  }
  try {
    const result = await hotReloadPlugin(root, options.profile, args[0]!, options.port, options.timeoutMs, options.scope)
    printReport(report('hot-reload', [
      finding('ok', 'host-module-reloaded', `HOST_MODULE_RELOADED: ${result.pluginId}`, { path: result.sourcePath }),
      finding('ok', 'temporary-hmr-disposed', 'Temporary module watcher and observer have been disposed.'),
      finding('info', 'behavior-unverified', 'Exercise the changed feature in the current authenticated WebUI. Module replacement is not functional acceptance.'),
    ], { evidence: ['HOST_MODULE_RELOADED'], hostRestart: false, behaviorVerified: false, result }), options.json)
    return 0
  } catch (error) {
    printReport(report('hot-reload', [finding('error', 'hot-reload-blocked', error instanceof Error ? error.message : String(error), {
      hint: 'Preserve source, resolve the named blocker, then retry the appropriate activation step.',
    })], { hostRestart: false, behaviorVerified: false }), options.json)
    return 1
  }
}
