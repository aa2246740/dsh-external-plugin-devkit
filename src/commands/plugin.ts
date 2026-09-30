import { finding, printReport, report } from '../internal/io.ts'
import { removeProfilePlugin } from '../internal/profile-plugin-remove.ts'
import type { CliOptions } from '../internal/types.ts'
import { installLocalBundle, localBundle } from '../internal/plugin-install.ts'

export async function cmdPlugin(args: string[], options: CliOptions, root: string): Promise<number> {
  if (args[0] === 'add') {
    try {
      if (!args[1] || args.length !== 2) throw new Error('usage: dshx plugin add <local-package-dir> --profile web|desktop --port <current-host-port> [--dry-run]')
      if (options.dryRun) {
        const bundle = localBundle(args[1])
        printReport(report('plugin add', [finding('ok', 'local-bundle', 'LOCAL_BUNDLE_READY: no npm publication is needed', { path: bundle.dir }),
          finding('info', 'dry-run', 'No install or Host mutation performed; the actual command verifies the single same-Home Host and uses its authenticated public plugin manager.')], { bundle }), options.json)
        return 0
      }
      const installed = await installLocalBundle(root, args[1], options.profile, options.port, options.timeoutMs)
      printReport(report('plugin add', [
        finding('ok', 'profile-installed', `PROFILE_INSTALLED: ${installed.name}@${installed.version}`, { path: installed.profileDir }),
        finding('ok', 'host-bundle-active', `HOST_BUNDLE_ACTIVE: official manager applied this bundle on unchanged PID ${installed.hostPid}`),
        finding('info', 'client-verification-required', 'Observe the plugin on the current page. RC2 client HMR can sync the new graph; Host activation alone does not prove its UI or behavior.'),
      ], { installed }), options.json)
      return 0
    } catch (error) {
      printReport(report('plugin add', [finding('error', 'plugin-add', error instanceof Error ? error.message : String(error))]), options.json)
      return 1
    }
  }
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
