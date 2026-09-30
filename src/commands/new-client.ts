import { activateNewClient } from '../internal/new-client.ts'
import {
  beginCreatorActivation,
  finishCreatorActivation,
  markCreatorActivationRunning,
  readCreatorContext,
} from '../internal/creator.ts'
import { currentHost, pidAlive } from '../internal/host.ts'
import { finding, printReport, report } from '../internal/io.ts'
import { profileDir, resolveDshHome } from '../internal/paths.ts'
import { loadPlugin } from '../internal/plugin.ts'
import type { CliOptions } from '../internal/types.ts'
import { join } from 'node:path'
import { inspectActivation, activationDecision } from '../internal/activation.ts'

/** Link, hot-mount, and prove one newly built external Web client without process control. */
export async function cmdActivateNewClient(args: string[], options: CliOptions, root: string): Promise<number> {
  const raw = args[0]
  if (!raw || args.length !== 1) {
    printReport(report('activate-new-client', [
      finding('error', 'usage', 'dshx activate-new-client <plugin> [--profile web] [--port <current-web-port>]'),
    ]), options.json)
    return 1
  }
  let handle: ReturnType<typeof beginCreatorActivation> | undefined
  let transaction: ReturnType<typeof markCreatorActivationRunning> | undefined
  try {
    const context = readCreatorContext()
    const patchPath = join(profileDir(resolveDshHome(), options.profile), 'cordis.patch.yml')
    const plugin = loadPlugin(root, raw)
    handle = beginCreatorActivation(root, plugin.id, patchPath, options.port, context)
    transaction = markCreatorActivationRunning(root, handle.transaction)
    const result = await activateNewClient(root, options.profile, raw, options.port, options.timeoutMs)
    let browserReloadDecision: 'required' | 'not-required' | 'conditional' | 'not-decided' = 'not-decided'
    // The completed Host transaction remains successful if this optional
    // capability inspection is unavailable. Page verification stays required.
    try { browserReloadDecision = activationDecision('new-client', inspectActivation(root, options.profile, raw)).browserReload } catch {}
    finishCreatorActivation(root, transaction, { ok: true, hostAlive: true })
    const output = report('activate-new-client', [
      finding('ok', 'source-built', `SOURCE_BUILT: ${result.packageName} passed dshx client handoff checks`, { path: result.packageDir }),
      finding('ok', 'artifact-synced', `ARTIFACT_SYNCED: profile ${result.profile} ${result.linkAction === 'installed' ? 'installed' : 'already had'} the verified link`, { path: result.profileDir }),
      finding('ok', 'next-boot-registered', `NEXT_BOOT_REGISTERED: ${result.dependencySpec}`),
      finding('ok', 'watched-patch', `${result.patchAction === 'inserted' ? 'inserted' : 'retriggered'} stable Host row ${result.id}`, { path: result.patchPath }),
      finding('ok', 'host-tree-active', `HOST_TREE_ACTIVE: current Web Host manifest contains ${result.hostEntry.id}`),
      finding('ok', 'client-manifest-present', `CLIENT_MANIFEST_PRESENT: ${result.hostEntry.clientUrl}`),
      finding('info', 'client-graph-verification', 'RC2 client HMR can synchronize the new row on the current page. Observe that page first; reload only when its graph transport is unavailable.'),
      finding('info', 'client-loaded-unproven', 'CLIENT_LOADED and VISUAL_BEHAVIOR_VERIFIED require observing the page; the Host manifest alone does not prove them.'),
    ], {
      evidence: ['SOURCE_BUILT', 'ARTIFACT_SYNCED', 'NEXT_BOOT_REGISTERED', 'HOST_TREE_ACTIVE', 'CLIENT_MANIFEST_PRESENT'],
      hostRestart: false,
      browserReload: browserReloadDecision === 'required',
      browserReloadDecision,
      clientVerificationRequired: true,
      result,
    })
    printReport(output, options.json)
    return 0
  } catch (error) {
    if (transaction) {
      const context = readCreatorContext()
      const hostAlive = context ? pidAlive(context.hostPid) : currentHost(root) !== undefined
      finishCreatorActivation(root, transaction, {
        ok: false,
        hostAlive,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    printReport(report('activate-new-client', [
      finding('error', 'activation', error instanceof Error ? error.message : String(error), {
        hint: 'Resolve the named source, configuration or access problem, then retry this activation step.',
      }),
    ], { hostRestart: false, browserReload: false }), options.json)
    return 1
  } finally {
    handle?.release()
  }
}
