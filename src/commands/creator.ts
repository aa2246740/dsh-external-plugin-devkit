import {
  acknowledgeCreatorIncident,
  claimCreatorPlugin,
  pendingCreatorIncidents,
  readCreatorClientFailure,
  readCreatorContext,
  releaseCreatorClaim,
} from '../internal/creator.ts'
import {
  adoptOrArmCreatorHost,
  disarmGuardian,
  guardianCreatorSnapshot,
  recoverCreatorClientFailure,
} from '../internal/guardian.ts'
import { finding, printReport, report } from '../internal/io.ts'
import type { CliOptions } from '../internal/types.ts'

function requireContext() {
  const context = readCreatorContext()
  if (!context) throw new Error('this Creator+ operation requires identity from the fixed bridge v2')
  return context
}

/** Internal structured protocol used by Creator Mode+ and its external Guardian. */
export async function cmdCreator(args: string[], options: CliOptions, root: string): Promise<number> {
  const action = args[0]
  try {
    if (action === 'claim') {
      const pluginId = args[1]
      if (!pluginId || args.length !== 2) throw new Error('usage: dshx creator claim <plugin>')
      const context = requireContext()
      const armed = await adoptOrArmCreatorHost(root, context)
      const claim = claimCreatorPlugin(root, pluginId, context)
      printReport(report('creator claim', [
        finding('ok', 'claimed', `${pluginId} belongs to Creator+ session ${context.sessionId}`),
        finding('ok', 'guardian', `external Guardian pid ${armed.guardian.pid} watches Web Host pid ${armed.host.pid}`),
        armed.adopted
          ? finding('info', 'adopted', `adopted the current official Web Host on 127.0.0.1:${armed.host.port}`)
          : finding('info', 'supervised', `using the existing dshx-owned Host on 127.0.0.1:${armed.host.port}`),
      ], { claim, host: armed.host, guardian: armed.guardian }), options.json)
      return 0
    }

    if (action === 'watch') {
      if (args.length !== 1) throw new Error('usage: dshx creator watch')
      const context = requireContext()
      const armed = await adoptOrArmCreatorHost(root, context)
      printReport(report('creator watch', [
        finding('ok', 'guardian', `external Guardian pid ${armed.guardian.pid} watches Web Host pid ${armed.host.pid}`),
      ], { host: armed.host, guardian: armed.guardian }), options.json)
      return 0
    }

    if (action === 'disarm') {
      if (args.length !== 1) throw new Error('usage: dshx creator disarm')
      disarmGuardian(root, Date.now(), 15_000)
      printReport(report('creator disarm', [
        finding('ok', 'guardian', 'external Guardian disarmed; no Host process was changed'),
      ]), options.json)
      return 0
    }

    if (action === 'status') {
      if (args.length !== 1) throw new Error('usage: dshx creator status')
      const snapshot = guardianCreatorSnapshot(root)
      printReport(report('creator status', [
        snapshot.guardian.running
          ? finding('ok', 'guardian', `external Guardian pid ${snapshot.guardian.state?.pid ?? '(unknown)'}`)
          : finding('warn', 'guardian', 'external Guardian is not running'),
        finding('info', 'claims', `${snapshot.claims.length} active plugin claim(s)`),
        finding('info', 'incidents', `${snapshot.pendingIncidentCount} pending recovery delivery/deliveries`),
      ], snapshot), options.json)
      return 0
    }

    if (action === 'client-failure') {
      if (args.length !== 1) throw new Error('usage: dshx creator client-failure')
      const failure = readCreatorClientFailure()
      if (!failure) throw new Error('client-failure requires a report from the fixed Creator+ Host bridge')
      const recovered = await recoverCreatorClientFailure(root, failure)
      printReport(report('creator client-failure', [
        recovered.reload
          ? finding('ok', 'quarantined', `${recovered.incident.pluginId ?? 'attributed plugin'} was removed from the live client graph`)
          : finding('warn', 'not-reloaded', recovered.incident.summary),
      ], recovered), options.json)
      return 0
    }

    if (action === 'release') {
      if (args.length !== 1) throw new Error('usage: dshx creator release')
      const context = requireContext()
      releaseCreatorClaim(root, context.sessionId)
      printReport(report('creator release', [finding('ok', 'released', `released claims for ${context.sessionId}`)]), options.json)
      return 0
    }

    if (action === 'recovery' && args[1] === 'pull') {
      if (args.length !== 2) throw new Error('usage: dshx creator recovery pull')
      const context = requireContext()
      const incidents = pendingCreatorIncidents(root, context.sessionId)
      printReport(report('creator recovery pull', [
        finding('ok', 'pending', `${incidents.length} recovery incident(s) for ${context.sessionId}`),
      ], { incidents }), options.json)
      return 0
    }

    if (action === 'recovery' && args[1] === 'ack') {
      const incidentId = args[2]
      if (!incidentId || args.length !== 3) throw new Error('usage: dshx creator recovery ack <incident-id>')
      const context = requireContext()
      const acknowledged = acknowledgeCreatorIncident(root, context.sessionId, incidentId)
      if (!acknowledged) throw new Error(`incident ${incidentId} is not pending for ${context.sessionId}`)
      printReport(report('creator recovery ack', [finding('ok', 'acknowledged', incidentId)]), options.json)
      return 0
    }

    throw new Error('usage: dshx creator <watch|claim|status|release|disarm|client-failure|recovery>')
  } catch (error) {
    printReport(report('creator', [finding('error', 'creator', error instanceof Error ? error.message : String(error))]), options.json)
    return 1
  }
}
