import { renameSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { auditActiveHmr } from './hot-reload-hmr-audit.mjs'

export const inject = ['loader', 'timer']

/** Observe official HMR for an unmounted package; never manipulate Node caches. */
export function apply(ctx, config) {
  if (config.expectedPid !== process.pid) throw new Error('new-client import target PID mismatch')
  const result = { transactionId: config.transactionId, pluginId: config.pluginId, pid: process.pid, phase: 'STARTING' }
  let armed = false, hmrFiber, stopped = false, pending
  const write = fields => {
    Object.assign(result, fields)
    const temporary = `${config.reportPath}.tmp`
    writeFileSync(temporary, JSON.stringify(result), { mode: 0o600 })
    renameSync(temporary, config.reportPath)
  }
  const liveTargets = () => [
    ...[...ctx.registry.values()].filter(runtime => runtime.name === config.pluginId).flatMap(runtime => [...runtime.fibers]),
    ...[...ctx.loader.entries()].filter(entry => entry.options.name === config.pluginId).map(entry => entry.fiber),
  ].filter(fiber => fiber && fiber.state !== 4)
  const complete = async evidence => {
    if (!armed || stopped || result.phase !== 'READY') return
    if (liveTargets().length) return write({ phase: 'FAILED', error: 'target became mounted during import preparation' })
    await auditActiveHmr(ctx, { hmrEntryId: config.hmrEntryId, targetFiles: config.targetFiles })
    if (stopped || result.phase !== 'READY') return
    write({ phase: 'IMPORT_READY', evidence })
  }
  ctx.on('hmr/change', url => {
    if (url === pathToFileURL(config.entryPath).href) {
      pending = complete('uncached-entry-change').catch(error => write({ phase: 'FAILED', error: String(error.message) }))
    }
  })
  ctx.on('hmr/reload', reloads => {
    if (!armed || result.phase !== 'READY') return
    const values = [...reloads.values()]
    if (values.some(value => value.runtime !== undefined)) {
      write({ phase: 'FAILED', error: 'import preparation would replace an existing runtime' })
      return
    }
    pending = complete('official-hmr-unmounted-import').catch(error => write({ phase: 'FAILED', error: String(error.message) }))
  })
  const poll = async () => {
    if (stopped || armed) return
    const rows = [...ctx.loader.entries()].filter(entry => entry.options.id === config.hmrEntryId)
    if (rows.length !== 1 || rows[0].fiber?.state !== 2) return
    hmrFiber = rows[0].fiber
    await auditActiveHmr(ctx, { hmrEntryId: config.hmrEntryId, targetFiles: config.targetFiles })
    if (stopped) return
    armed = true
    write({ phase: liveTargets().length ? 'ALREADY_MOUNTED' : 'READY' })
  }
  const cancel = ctx.setInterval(() => {
    pending ??= poll().catch(error => write({ phase: 'FAILED', error: String(error.message) })).finally(() => { pending = undefined })
  }, 25)
  ctx.effect(() => async () => {
    stopped = true
    cancel()
    await pending
    if (hmrFiber) await hmrFiber.dispose()
    write({ disposed: true })
  }, 'new-client import observer disposal')
}
