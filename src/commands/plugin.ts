import { finding, printReport, report } from '../internal/io.ts'
import { removeProfilePlugin } from '../internal/profile-plugin-remove.ts'
import type { CliOptions } from '../internal/types.ts'

export async function cmdPlugin(args: string[], options: CliOptions, root: string): Promise<number> {
  try {
    const action = args[0]
    const pluginId = args[1]
    if (action !== 'remove' || !pluginId || args.length !== 2) {
      throw new Error('usage: dshx plugin remove <package> --profile web --port <current-web-port>')
    }
    if (options.profile !== 'web') throw new Error('safe profile plugin removal currently supports only the Web profile')
    const removed = await removeProfilePlugin(root, pluginId, options.port, options.timeoutMs)
    printReport(report('plugin remove', [
      finding('ok', 'host-tree-inactive', `HOST_TREE_INACTIVE: same-PID Web Host ${removed.hostPid} no longer contains ${pluginId}`),
      finding('ok', 'profile-dependency-removed', `PROFILE_DEPENDENCY_REMOVED: ${removed.profileDependencyAction}`, { path: removed.profileDir }),
      finding('ok', 'profile-bundle-removed', `PROFILE_BUNDLE_REMOVED: ${removed.profileBundleAction}`, { path: removed.profileDir }),
      finding('info', 'profile-entry', `Profile node_modules action: ${removed.profileEntryAction}`),
      removed.sourcePreserved
        ? finding('ok', 'source-preserved', `SOURCE_PRESERVED: ${removed.sourcePath}`, { path: removed.sourcePath })
        : finding('info', 'source-not-touched', 'DSHX did not delete source; no surviving local source path was available to prove SOURCE_PRESERVED'),
      removed.cleanupPending
        ? finding('warn', 'disable-retained', 'Temporary live disable is retained for the old boot. After the next normal DSH.app reopen, run this same command once to remove it safely.', { path: removed.patchPath })
        : removed.disableAction === 'removed-after-cold-boot'
          ? finding('ok', 'disable-cleaned', 'Cold-boot evidence was present; the temporary disable was removed and the live graph stayed clean.', { path: removed.patchPath })
          : finding('info', 'disable-policy', `Disable action: ${removed.disableAction}`, { path: removed.patchPath }),
      finding('info', 'browser-reload', 'Already-open pages may still hold the old Loader graph; hard refresh or open a new page.'),
      finding('info', 'no-restart', 'No Host restart or browser control was attempted.'),
    ], {
      evidence: ['HOST_TREE_INACTIVE', 'PROFILE_DEPENDENCY_REMOVED', 'PROFILE_BUNDLE_REMOVED', ...(removed.sourcePreserved ? ['SOURCE_PRESERVED'] : [])],
      removed,
    }), options.json)
    return 0
  } catch (error) {
    printReport(report('plugin remove', [
      finding('error', 'plugin-remove', error instanceof Error ? error.message : String(error)),
    ]), options.json)
    return 1
  }
}
