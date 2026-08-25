import { collectUpdatePlan } from '../internal/update.ts'
import {
  candidateFailures,
  candidateSummary,
  prepareUpdateCandidate,
  verifyUpdateCandidate,
} from '../internal/update-candidate.ts'
import { applyUpdate, rollbackUpdate } from '../internal/update-apply.ts'
import { finding, printReport, report } from '../internal/io.ts'
import type { CliOptions, Finding, UpdateAction } from '../internal/types.ts'

function updateAction(value: string | undefined): UpdateAction | undefined {
  if (value === undefined || value === 'plan') return 'plan'
  if (value === 'prepare' || value === 'verify' || value === 'apply' || value === 'rollback') return value
  return undefined
}

function candidateFindings(action: 'prepare' | 'verify', result: ReturnType<typeof prepareUpdateCandidate>): Finding[] {
  const failures = candidateFailures(result.state)
  return [
    finding('ok', 'candidate', `${result.state.target.version} @ ${result.state.target.sha.slice(0, 12)} in ${result.state.candidateRoot}`),
    finding('ok', 'harness-install', 'candidate dependencies installed from the frozen lockfile'),
    finding('ok', 'harness-build', 'candidate Harness full build passed'),
    ...result.state.plugins.map(plugin => {
      const ok = action === 'prepare'
        ? plugin.build
        : plugin.build && plugin.staticCheck === true && plugin.runtime === true
      const detail = action === 'prepare'
        ? `copied=${plugin.copied} build=${plugin.build}`
        : `build=${plugin.build} check=${plugin.staticCheck ?? false} cold-boot=${plugin.runtime ?? false}`
      return finding(ok ? 'ok' : 'error', `plugin-${action}`, `${plugin.name}: ${detail}`, { path: plugin.stagedPath })
    }),
    failures.length === 0
      ? finding('ok', `${action}-gate`, `${result.state.plugins.length}/${result.state.plugins.length} plugins passed the ${action} gate`)
      : finding('error', `${action}-gate`, `${failures.length} plugin(s) failed: ${failures.map(plugin => plugin.name).join(', ')}`),
    finding('info', 'source-safety', 'all plugin work used candidate copies; source plugin bytes were not edited'),
  ]
}

export function cmdUpdate(args: string[], options: CliOptions, root: string): number {
  const action = updateAction(args[0])
  if (!action) {
    printReport(report('update', [finding('error', 'usage', 'dshx update plan|prepare|verify|apply|rollback [--target <dsh-v...>]')]), options.json)
    return 2
  }
  if (action === 'apply' || action === 'rollback') {
    try {
      const result = action === 'apply' ? applyUpdate(root, options) : rollbackUpdate(root, options)
      const findings: Finding[] = action === 'apply'
        ? [
          finding('ok', 'checkout', `${result.state.target.version} @ ${result.state.target.sha.slice(0, 12)} on ${result.state.updateBranch}`),
          finding('ok', 'harness-build', 'target Harness frozen install and full build passed'),
          finding('ok', 'plugins', `${Object.keys(result.pluginChecks).length}/${Object.keys(result.pluginChecks).length} plugins rebuilt and checked on the target checkout`),
          finding('ok', 'rollback', 'exact pre-update dependencies and generated plugin artifacts are preserved', { path: result.rollbackPath }),
          finding('info', 'runtime-limit', 'apply does not claim browser/client activation; run the final Host and browser acceptance gate'),
        ]
        : [
          finding('ok', 'checkout', `${result.state.original.version} @ ${result.state.original.sha.slice(0, 12)} restored`),
          finding('ok', 'dependencies', 'pre-update Harness and plugin dependency trees restored'),
          finding('ok', 'artifacts', 'pre-update generated plugin artifacts restored'),
        ]
      printReport(report(`update ${action}`, findings, {
        status: result.state.status,
        rollbackPath: result.rollbackPath,
        original: result.state.original,
        target: result.state.target,
        pluginBuilds: result.pluginBuilds,
        pluginChecks: result.pluginChecks,
      }), options.json)
      return 0
    } catch (error) {
      printReport(report(`update ${action}`, [finding('error', action, error instanceof Error ? error.message : String(error))]), options.json)
      return 1
    }
  }
  if (action === 'prepare' || action === 'verify') {
    try {
      const plan = collectUpdatePlan(root, options.target)
      const result = action === 'prepare'
        ? prepareUpdateCandidate(root, options)
        : verifyUpdateCandidate(root, options)
      printReport(report(`update ${action}`, candidateFindings(action, result), candidateSummary(plan, result)), options.json)
      return result.ok ? 0 : 1
    } catch (error) {
      printReport(report(`update ${action}`, [finding('error', action, error instanceof Error ? error.message : String(error))]), options.json)
      return 1
    }
  }
  try {
    const plan = collectUpdatePlan(root, options.target)
    const findings: Finding[] = [
      finding('ok', 'current', `${plan.checkout.version} @ ${plan.checkout.sha.slice(0, 12)} (${plan.checkout.branch})`),
      finding('ok', 'target', `${plan.target.version} @ ${plan.target.sha.slice(0, 12)} (${plan.target.local ? 'local' : 'remote'})`),
      plan.checkout.trackedChanges.length === 0
        ? finding('ok', 'tracked-tree', 'no tracked Harness changes')
        : finding('error', 'tracked-tree', `${plan.checkout.trackedChanges.length} tracked Harness change(s) would be lost by a blind update`, {
          hint: 'commit, stash, or migrate these changes explicitly; update never hides them',
        }),
      plan.checkout.targetCollisions.length === 0
        ? finding('ok', 'untracked-collisions', 'target does not overwrite discovered untracked paths')
        : finding('error', 'untracked-collisions', `${plan.checkout.targetCollisions.length} untracked path(s) collide with the target release`),
      finding('ok', 'plugins', `${plan.plugins.length} plugin entr${plan.plugins.length === 1 ? 'y' : 'ies'} inventoried`),
      ...plan.plugins.filter(plugin => !plugin.valid).map(plugin => finding('error', 'plugin-invalid', `${plugin.name}: ${plugin.issue ?? 'invalid plugin entry'}`, { path: plugin.path })),
      ...plan.plugins.filter(plugin => plugin.marker === 'logger-only').map(plugin => finding('warn', 'marker-unobservable', `${plugin.name}: marker uses a logger path that RC2 launcher stdout may not expose`, {
        path: plugin.path,
        hint: 'candidate verification will use a staging-only apply probe; source bytes stay unchanged',
      })),
      ...plan.supervisedHost ? [finding('warn', 'live-host', `supervised Host pid ${plan.supervisedHost.pid} is active on port ${plan.supervisedHost.port}`, {
        hint: 'plan is read-only; prepare stays isolated and apply will require one controlled lifecycle action',
      })] : [finding('ok', 'live-host', 'dshx is not supervising a Host')],
    ]
    for (const blocker of plan.blockers) {
      if (!findings.some(item => item.level === 'error' && item.message.includes(blocker))) {
        findings.push(finding('error', 'apply-blocker', blocker))
      }
    }
    const result = report('update plan', findings, plan)
    printReport(result, options.json)
    return result.ok ? 0 : 1
  } catch (error) {
    printReport(report('update plan', [finding('error', 'plan', error instanceof Error ? error.message : String(error))]), options.json)
    return 1
  }
}
