import { randomUUID } from 'node:crypto'
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { auditActiveHmr } from './hot-reload-hmr-audit.mjs'

export const inject = ['loader', 'timer']

// Public Cordis FiberState values. Keep these explicit so this standalone
// runtime entry does not import a private Loader/HMR implementation module.
const PENDING = 0
const LOADING = 1
const ACTIVE = 2
const FAILED = 3
const DISPOSED = 4
const HMR_MODULE = '@deepseek-ai/cordis-plugin-hmr'

const ID = /^[a-z][a-z0-9-]{0,199}$/
const TRANSACTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HMR_ENTRY_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/
const CONFIG_KEYS = new Set([
  'transactionId', 'pluginId', 'hmrEntryId', 'reportPath', 'expectedPid',
  'expectedEntryUrl', 'targetScope', 'targetEntryId', 'targetEntryName',
  'targetFiles',
])

function configuration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('hot-reload observer config must be an object')
  for (const key of Object.keys(value)) {
    if (!CONFIG_KEYS.has(key)) throw new Error(`hot-reload observer config has unsupported field ${key}`)
  }
  if (typeof value.transactionId !== 'string' || !TRANSACTION_ID.test(value.transactionId)) {
    throw new Error('hot-reload observer transactionId must be a UUID')
  }
  if (typeof value.pluginId !== 'string' || !ID.test(value.pluginId)) {
    throw new Error('hot-reload observer pluginId must be lower-case kebab-case')
  }
  if (typeof value.hmrEntryId !== 'string' || !HMR_ENTRY_ID.test(value.hmrEntryId) || value.hmrEntryId === value.pluginId) {
    throw new Error('hot-reload observer hmrEntryId must be a distinct bounded Loader id')
  }
  if (value.targetScope !== 'root' && value.targetScope !== 'preset') {
    throw new Error('hot-reload observer targetScope must be root or preset')
  }
  if (typeof value.targetEntryId !== 'string' || !HMR_ENTRY_ID.test(value.targetEntryId)) {
    throw new Error('hot-reload observer targetEntryId must be a bounded Loader id')
  }
  if (typeof value.targetEntryName !== 'string' || value.targetEntryName.length < 1
    || value.targetEntryName.length > 1_024 || /[\r\n\0]/.test(value.targetEntryName)) {
    throw new Error('hot-reload observer targetEntryName must be a bounded module specifier')
  }
  if (!Array.isArray(value.targetFiles) || value.targetFiles.length < 1 || value.targetFiles.length > 32) {
    throw new Error('hot-reload observer targetFiles must be a bounded non-empty array')
  }
  if (typeof value.reportPath !== 'string' || value.reportPath.length > 4_096 || !isAbsolute(value.reportPath)) {
    throw new Error('hot-reload observer reportPath must be an absolute bounded path')
  }
  if (!Number.isSafeInteger(value.expectedPid) || value.expectedPid < 1 || value.expectedPid !== process.pid) {
    throw new Error('hot-reload observer expectedPid does not match the current Host')
  }
  let expectedEntryUrl
  try {
    expectedEntryUrl = new URL(value.expectedEntryUrl)
  } catch {
    throw new Error('hot-reload observer expectedEntryUrl must be an exact file URL')
  }
  if (typeof value.expectedEntryUrl !== 'string' || value.expectedEntryUrl.length > 4_096
    || expectedEntryUrl.protocol !== 'file:' || expectedEntryUrl.username || expectedEntryUrl.password
    || expectedEntryUrl.host || expectedEntryUrl.search || expectedEntryUrl.hash
    || expectedEntryUrl.href !== value.expectedEntryUrl) {
    throw new Error('hot-reload observer expectedEntryUrl must be an exact file URL')
  }
  return { ...value, reportPath: resolve(value.reportPath), expectedEntryUrl: expectedEntryUrl.href }
}

function exactEntries(ctx, id, name) {
  return [...ctx.loader.entries()].filter(entry => entry?.options?.id === id && entry?.options?.name === name)
}

function hmrFibers(ctx, id) {
  const fibers = new Set()
  for (const entry of ctx.loader.entries()) {
    if (entry?.options?.id === id && entry?.options?.name === HMR_MODULE
      && entry?.fiber && typeof entry.fiber === 'object') fibers.add(entry.fiber)
  }
  return [...fibers]
}

function liveRuntimeFibers(runtime) {
  if (!runtime?.fibers || typeof runtime.fibers[Symbol.iterator] !== 'function') return undefined
  return [...runtime.fibers].filter(fiber => fiber && typeof fiber === 'object' && fiber.state !== DISPOSED)
}

function targetSnapshot(ctx, config) {
  const entries = exactEntries(ctx, config.targetEntryId, config.targetEntryName)
  if (entries.length !== 1) throw observerFailure(config.targetScope === 'root'
    ? 'ROOT_TARGET_AMBIGUOUS'
    : 'PRESET_ANCHOR_INVALID')
  const entry = entries[0]
  if (config.targetScope === 'root') {
    if (!entry.fiber || typeof entry.fiber !== 'object') throw observerFailure('ROOT_TARGET_AMBIGUOUS')
    const live = liveRuntimeFibers(entry.fiber.runtime)
    if (!live || live.length < 1 || live.some(fiber => fiber.entry !== entry)) {
      throw observerFailure('ROOT_RUNTIME_SCOPE_AMBIGUOUS')
    }
    return { fibers: live }
  }
  if (entry.disabled !== true || entry.fiber) throw observerFailure('PRESET_ANCHOR_INVALID')
  if (!ctx.registry || typeof ctx.registry.values !== 'function') throw observerFailure('PRESET_RUNTIME_AMBIGUOUS')
  const runtimes = [...ctx.registry.values()].filter(runtime => runtime?.name === config.pluginId)
  if (runtimes.length !== 1) throw observerFailure('PRESET_RUNTIME_AMBIGUOUS')
  if ([...ctx.loader.entries()].some(rootEntry => rootEntry !== entry && rootEntry?.fiber
    && (rootEntry.fiber.runtime === runtimes[0] || rootEntry.options?.name === config.targetEntryName))) {
    throw observerFailure('PRESET_ROOT_SCOPE_PRESENT')
  }
  const fibers = liveRuntimeFibers(runtimes[0])
  if (!fibers || fibers.length < 1) throw observerFailure('PRESET_RUNTIME_AMBIGUOUS')
  return {
    fibers,
    discoveryAnchor: { disabled: true, hasFiber: false },
  }
}

function writeAtomicJson(path, value) {
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true })
  const temporary = join(directory, `.${basename(path)}.${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

function observerFailure(code) {
  const error = new Error(code)
  error.observerCode = code
  return error
}

function reloadValues(reloads) {
  if (Array.isArray(reloads)) return reloads
  if (reloads && typeof reloads === 'object' && typeof reloads.values === 'function') return [...reloads.values()]
  if (reloads && typeof reloads === 'object') return Object.values(reloads)
  return []
}

function exactFileUrl(value) {
  if (value instanceof URL) value = value.href
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'file:' && !url.username && !url.password && !url.host
      && !url.search && !url.hash && url.href === value
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

export function apply(ctx, rawConfig) {
  const config = configuration(rawConfig)
  if (typeof ctx?.loader?.entries !== 'function' || typeof ctx.setInterval !== 'function'
    || typeof ctx.effect !== 'function' || typeof ctx.on !== 'function') {
    throw new Error('hot-reload observer requires public loader and timer context services')
  }

  const generationIds = new WeakMap()
  let nextGeneration = 1
  const generationId = (fiber) => {
    let id = generationIds.get(fiber)
    if (!id) {
      id = `generation-${nextGeneration++}`
      generationIds.set(fiber, id)
    }
    return id
  }

  const report = {
    version: 1,
    transactionId: config.transactionId,
    pluginId: config.pluginId,
    hmrEntryId: config.hmrEntryId,
    targetScope: config.targetScope,
    expectedPid: config.expectedPid,
    pid: process.pid,
    samePid: true,
  }
  let originalFibers
  let hmrFiber
  let moduleReloaded = false
  let hmrDisposed = false
  let hmrReloadObservedAt
  let stopped = false
  let pollFailed = false
  let eventScopeExceeded = false
  let activePoll
  const hmrMatchedFibers = new Set()

  const auditHmr = async () => {
    try {
      await auditActiveHmr(ctx, { hmrEntryId: config.hmrEntryId, targetFiles: config.targetFiles })
    } catch {
      throw observerFailure('ACTIVE_HMR_AUDIT_FAILED')
    }
  }

  const publish = (phase, fields) => {
    Object.assign(report, fields, { phase })
    writeAtomicJson(config.reportPath, report)
  }

  const poll = async () => {
    if (stopped || pollFailed) return
    if (eventScopeExceeded) throw observerFailure('HMR_EVENT_SCOPE_EXCEEDED')
    if (!originalFibers) {
      const target = targetSnapshot(ctx, config)
      const targets = target.fibers
      const hmr = hmrFibers(ctx, config.hmrEntryId)
      if (targets.length < 1 || targets.some(fiber => fiber.state !== ACTIVE && fiber.state !== FAILED)) return
      if (targets.some(fiber => fiber.runtime === undefined)) return
      if (hmr.length !== 1 || hmr[0].state !== ACTIVE) return
      await auditHmr()
      originalFibers = targets
      hmrFiber = hmr[0]
      const targetGenerationStates = originalFibers.map(fiber => ({
        generationId: generationId(fiber),
        state: fiber.state === ACTIVE ? 'ACTIVE' : 'FAILED',
      }))
      publish('READY', {
        readyAt: new Date().toISOString(),
        targetGenerationIds: targetGenerationStates.map(target => target.generationId),
        targetGenerationStates,
        hmrGenerationId: generationId(hmrFiber),
        ...target.discoveryAnchor ? { discoveryAnchor: target.discoveryAnchor } : {},
      })
      return
    }

    if (!moduleReloaded) {
      const targets = targetSnapshot(ctx, config).fibers
      if (targets.some(fiber => fiber.state === FAILED || fiber.state === PENDING || fiber.state === DISPOSED)) return
      if (targets.length !== originalFibers.length || targets.some(fiber => fiber.state !== ACTIVE)) return
      if (targets.some(fiber => originalFibers.includes(fiber))) return
      if (!originalFibers.every(fiber => hmrMatchedFibers.has(fiber))) return
      if (originalFibers.some(fiber => fiber.state === ACTIVE || fiber.state === LOADING || fiber.state === PENDING)) return
      if (originalFibers.some(fiber => fiber.state !== DISPOSED)) return
      await auditHmr()
      if (originalFibers.some(fiber => typeof fiber.dispose !== 'function')) {
        throw observerFailure('TARGET_DISPOSE_UNAVAILABLE')
      }
      try {
        await Promise.all(originalFibers.map(fiber => fiber.dispose()))
      } catch {
        throw observerFailure('TARGET_DISPOSE_WAIT_FAILED')
      }
      moduleReloaded = true
      publish('MODULE_RELOADED', {
        moduleReloaded: {
          at: new Date().toISOString(),
          oldGenerationIds: originalFibers.map(generationId),
          newGenerationIds: targets.map(generationId),
          hmrEventAt: hmrReloadObservedAt,
          hmrEventMatchedGenerationIds: originalFibers.map(generationId),
          samePid: process.pid === config.expectedPid,
        },
      })
      return
    }

    if (!hmrDisposed && hmrFibers(ctx, config.hmrEntryId).length === 0) {
      if (typeof hmrFiber?.dispose !== 'function') {
        throw observerFailure('HMR_DISPOSE_UNAVAILABLE')
      }
      try {
        await hmrFiber.dispose()
      } catch {
        throw observerFailure('HMR_DISPOSE_WAIT_FAILED')
      }
      hmrDisposed = true
      publish('HMR_DISPOSED', {
        hmrDisposed: {
          at: new Date().toISOString(),
          generationId: generationId(hmrFiber),
        },
      })
    }
  }

  ctx.on('hmr/reload', (reloads) => {
    if (!originalFibers || moduleReloaded || stopped || pollFailed) return
    const values = reloadValues(reloads)
    const targetRuntimes = new Set(originalFibers.map(fiber => fiber.runtime))
    const matchedTarget = values.some(value => value && typeof value === 'object'
      && targetRuntimes.has(value.runtime)
      && exactFileUrl(value.filename) === config.expectedEntryUrl)
    if (matchedTarget && values.some(value => value && typeof value === 'object'
      && value.runtime !== undefined && !targetRuntimes.has(value.runtime))) {
      eventScopeExceeded = true
      schedulePoll()
      return
    }
    for (const fiber of originalFibers) {
      if (values.some(value => value && typeof value === 'object'
        && value.runtime === fiber.runtime
        && exactFileUrl(value.filename) === config.expectedEntryUrl)) {
        hmrMatchedFibers.add(fiber)
      }
    }
    if (originalFibers.every(fiber => hmrMatchedFibers.has(fiber))) {
      hmrReloadObservedAt ??= new Date().toISOString()
    }
  })

  const schedulePoll = () => {
    if (stopped || pollFailed || activePoll) return
    activePoll = poll()
      .catch((error) => {
        pollFailed = true
        const code = typeof error?.observerCode === 'string' ? error.observerCode : 'OBSERVER_POLL_FAILED'
        try {
          publish('FAILED', { failure: { at: new Date().toISOString(), code } })
        } catch {
          // If the atomic report itself is unavailable, the supervising CLI
          // retains its timeout as the final fail-closed signal.
        }
      })
      .finally(() => { activePoll = undefined })
  }
  const cancelTimer = ctx.setInterval(schedulePoll, 25)
  ctx.effect(() => async () => {
    stopped = true
    if (typeof cancelTimer === 'function') cancelTimer()
    await activePoll
    publish('OBSERVER_DISPOSED', {
      observerDisposed: { at: new Date().toISOString() },
    })
  }, 'dshx hot-reload observer report')
  schedulePoll()
}
