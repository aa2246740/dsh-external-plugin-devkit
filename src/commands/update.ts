import { collectUpdatePlan } from '../internal/update.ts'
import { officialDisableOnlyDirty } from '../internal/official-plugin-policy.ts'
import { finding, printReport, report } from '../internal/io.ts'
import type { CliOptions, Finding, UpdateAction } from '../internal/types.ts'

function updateAction(value: string | undefined): UpdateAction | undefined {
  if (value === undefined || value === 'plan') return 'plan'
  if (value === 'prepare' || value === 'verify' || value === 'apply' || value === 'rollback') return value
  return undefined
}

export async function cmdUpdate(args: string[], options: CliOptions, root: string): Promise<number> {
  const action = updateAction(args[0])
  if (!action) {
    printReport(report('update', [finding('error', 'usage', 'dshx update plan [--target <dsh-v...>]')]), options.json)
    return 2
  }
  if (action !== 'plan') {
    printReport(report(`update ${action}`, [finding('error', 'core-source-immutable', 'CORE_SOURCE_IMMUTABLE: DSHX is an external-plugin tool. Harness source preparation, rebuilding, switching and rollback are disabled; only update plan is available.')]), options.json)
    return 1
  }
  try {
    const plan = collectUpdatePlan(root, options.target, process.env, options.pluginSources)
    const findings: Finding[] = [
      finding('ok', 'current', `${plan.checkout.version} @ ${plan.checkout.sha.slice(0, 12)} (${plan.checkout.branch})`),
      finding('ok', 'target', `${plan.target.version} @ ${plan.target.sha.slice(0, 12)} (${plan.target.local ? 'local' : 'remote'})`),
      plan.checkout.trackedChanges.length === 0
        ? finding('ok', 'tracked-tree', 'no tracked Harness changes')
        : officialDisableOnlyDirty(root, plan.checkout.trackedChanges, plan.officialPluginDisables)
          ? finding('info', 'tracked-tree', `${plan.checkout.trackedChanges.length} tracked official-plugin disable(s) recorded`, {
            hint: 'these existing edits are inventoried only; DSHX will not change official files',
          })
          : finding('error', 'tracked-tree', `${plan.checkout.trackedChanges.length} tracked Harness change(s) would be lost by a blind update`, {
            hint: 'preserve these existing changes; this command only inventories them',
          }),
      ...plan.officialPluginDisables.disables.length === 0
        ? [finding('ok', 'official-plugin-disable', 'no user-disabled official plugins')]
        : plan.officialPluginDisables.disables.map(item => finding('info', 'official-plugin-disable', `${item.id} (${item.name}): ${item.surfaces.join(', ')}`, {
          hint: 'read-only inventory; no official source is modified',
        })),
      plan.checkout.targetCollisions.length === 0
        ? finding('ok', 'untracked-collisions', 'target does not overwrite discovered untracked paths')
        : finding('error', 'untracked-collisions', `${plan.checkout.targetCollisions.length} untracked path(s) collide with the target release`),
      finding('ok', 'plugins', `${plan.plugins.length} plugin entr${plan.plugins.length === 1 ? 'y' : 'ies'} inventoried`),
      ...plan.staleProfileDependencies.map(item => finding('warn', 'profile-local-missing', `${item.name}: inactive local dependency target is missing and was not staged`, {
        path: item.source,
        hint: `profile records ${item.spec}; repair or remove that stale plugin dependency through the plugin lifecycle`,
      })),
      ...plan.plugins.filter(plugin => !plugin.valid).map(plugin => finding('error', 'plugin-invalid', `${plugin.name}: ${plugin.issue ?? 'invalid plugin entry'}`, { path: plugin.path })),
      ...plan.plugins.filter(plugin => plugin.marker === 'logger-only').map(plugin => finding('warn', 'marker-unobservable', `${plugin.name}: marker uses a logger path that the current Harness launcher stdout may not expose`, {
        path: plugin.path,
        hint: 'runtime verification requires an observable plugin marker',
      })),
      ...plan.supervisedHost ? [finding('warn', 'live-host', `supervised Host pid ${plan.supervisedHost.pid} is active on port ${plan.supervisedHost.port}`, {
        hint: 'plan is read-only; source-changing update stages are disabled',
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
