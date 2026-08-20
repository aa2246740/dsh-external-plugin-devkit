import { activationDecision, inspectActivation, isActivationChange } from '../internal/activation.ts'
import { clientEntryFindings } from '../internal/file-copy.ts'
import { finding, printReport, report } from '../internal/io.ts'
import type { CliOptions, Finding } from '../internal/types.ts'

export function cmdActivationPlan(args: string[], options: CliOptions, root: string): number {
  const raw = args[0]
  if (!raw) {
    printReport(report('activation-plan', [finding('error', 'usage', 'dshx activation-plan <plugin|package-dir> [--change patch|manifest|preset|client|new-client|server|artifact]')]), options.json)
    return 1
  }
  if (options.change !== undefined && !isActivationChange(options.change)) {
    printReport(report('activation-plan', [finding('error', 'change', `unsupported --change ${options.change}`, {
      hint: 'use patch, manifest, preset, client, new-client, server, or artifact',
    })]), options.json)
    return 1
  }

  try {
    const facts = inspectActivation(root, options.profile, raw)
    const findings: Finding[] = [
      finding('ok', 'target', `${facts.id} (${facts.packageName})`, { path: facts.packageDir }),
      facts.dependencySpec
        ? finding('ok', 'profile-dependency', `${facts.packageName}: ${facts.dependencySpec}`)
        : finding('info', 'profile-dependency', `${facts.packageName} is not a dependency of profile ${options.profile}`),
      facts.bundleDeclared
        ? finding('info', 'bundle-declaration', 'package declares dsh.bundle')
        : finding('info', 'bundle-declaration', 'package does not declare dsh.bundle'),
      facts.bundleRegistered
        ? finding('ok', 'bundle-registration', `dsh.profile.bundles contains ${facts.packageName} (captured at host boot)`)
        : finding('info', 'bundle-registration', `dsh.profile.bundles does not contain ${facts.packageName}`),
      facts.profilePatchEntry || facts.homePatchEntry
        ? finding('ok', 'watched-patch-entry', `stable id ${facts.id} appears in ${facts.profilePatchEntry ? 'profile' : 'home'} cordis.patch.yml`)
        : finding('info', 'watched-patch-entry', `id ${facts.id} is not explicitly present in a watched user patch`),
    ]

    if (facts.dumpError) {
      findings.push(finding('error', 'offline-composition', 'dump-config failed; plan cannot inspect the disk-composed tree', { hint: facts.dumpError }))
    } else {
      findings.push(facts.inOfflineComposition
        ? finding('ok', 'offline-composition', `disk-composed tree contains ${facts.id}; this is not proof of the running host`, { path: facts.compositionSource })
        : finding('info', 'offline-composition', `${facts.id} is absent from the disk-composed tree; installation is not activation`))
    }

    findings.push(facts.supervisedPid
      ? finding('info', 'live-scope', `dshx supervises pid ${facts.supervisedPid} (${facts.supervisedProfile}); activation-plan does not claim its Loader state`)
      : finding('info', 'live-scope', 'no dshx-supervised host; this command remains a disk-state plan'))

    if (facts.hasClient) findings.push(...clientEntryFindings(facts.packageDir))

    if (!options.change) {
      findings.push(finding('info', 'change-required', 'inventory complete; choose the changed surface before acting', {
        hint: 'rerun with --change patch|manifest|preset|client|new-client|server|artifact',
      }))
      const result = report('activation-plan', findings, {
        facts,
        branches: ['patch', 'manifest', 'preset', 'client', 'new-client', 'server', 'artifact'],
      })
      printReport(result, options.json)
      return result.ok ? 0 : 1
    }

    const decision = activationDecision(options.change, facts)
    findings.push(
      finding('ok', 'activation-method', decision.method),
      finding(decision.hostRestart === 'required' ? 'warn' : 'info', 'host-restart', decision.hostRestart),
      finding(decision.browserReload === 'required' ? 'warn' : 'info', 'browser-reload', decision.browserReload),
      ...decision.blockers.map(message => finding('error', 'activation-blocker', message)),
      ...decision.preconditions.map(message => finding('info', 'precondition', message)),
      ...decision.proof.map(message => finding('info', 'required-proof', message)),
    )
    const result = report('activation-plan', findings, { facts, change: options.change, decision })
    printReport(result, options.json)
    return result.ok ? 0 : 1
  } catch (error) {
    printReport(report('activation-plan', [finding('error', 'target', error instanceof Error ? error.message : String(error))]), options.json)
    return 1
  }
}
