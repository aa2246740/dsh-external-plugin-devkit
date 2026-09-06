import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { apply, inject } from '../src/runtime/hot-reload-observer.mjs'

const ACTIVE = 2
const FAILED = 3
const PENDING = 0
const LOADING = 1
const DISPOSED = 4
const HMR_ID = 'dshx-hot-reload-hmr-12345678123442348234123456789abc'
const HMR_MODULE = '@deepseek-ai/cordis-plugin-hmr'

function fiber(state = ACTIVE, options = {}) {
  const value = {
    state,
    runtime: undefined,
    disposeCalls: 0,
    async dispose() {
      this.disposeCalls += 1
      if (options.disposeError) throw new Error(options.disposeError)
    },
  }
  const runtime = { name: 'demo', fibers: new Set([value]) }
  value.runtime = runtime
  return value
}

function pluginRuntime(...fibers) {
  const runtime = { name: 'demo', fibers: new Set(fibers) }
  for (const item of fibers) item.runtime = runtime
  return runtime
}

function entry(id, value, field = 'name') {
  const name = id === HMR_ID ? HMR_MODULE : id
  const result = field === 'id'
    ? { options: { id, name }, id, fiber: value }
    : { options: { id, name }, id, fiber: value }
  value.entry = result
  return result
}

function harness(initialEntries, initialRuntimes = []) {
  let entries = initialEntries
  let runtimes = initialRuntimes
  let tick
  let dispose
  let timerCancelled = false
  const listeners = new Map()
  const hmrCallback = {}
  const hmrRuntime = { callback: hmrCallback, get fibers() {
    return new Set(entries.filter(item => item?.options?.id === HMR_ID).map(item => item.fiber))
  } }
  const ctx = {
    loader: {
      entries: () => entries,
      import: async () => hmrCallback,
      unwrapExports: value => value,
    },
    registry: {
      get: callback => callback === hmrCallback ? hmrRuntime : undefined,
      values: () => runtimes,
    },
    setInterval(callback) {
      tick = callback
      return () => { timerCancelled = true }
    },
    effect(factory) { dispose = factory() },
    on(event, listener) { listeners.set(event, listener) },
  }
  return {
    ctx,
    setEntries(next) {
      entries = next
      const hmrEntry = entries.find(item => item?.options?.id === HMR_ID)
      if (hmrEntry?.fiber) hmrEntry.fiber.entry = hmrEntry
    },
    setRuntimes(next) { runtimes = next },
    prepareAudit(config) {
      const hmrEntry = entries.find(item => item?.options?.id === config.hmrEntryId)
      const hmr = hmrEntry?.fiber
      if (!hmr) return
      const auditConfig = { root: [...config.targetFiles] }
      const service = { config: auditConfig, baseDir: '/', ctx: { fiber: hmr } }
      hmr.entry = hmrEntry
      hmr.config = auditConfig
      hmr.ctx = { hmr: service }
    },
    async poll() { tick(); await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)) },
    emit(event, value) { listeners.get(event)?.(value) },
    async dispose() { await dispose() },
    timerCancelled: () => timerCancelled,
  }
}

function report(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function targetUrl(root) {
  return pathToFileURL(realpathSync(join(root, 'target.js'))).href
}

function observerConfig(root, reportPath, fields = {}) {
  const targetFile = join(root, 'target.js')
  writeFileSync(targetFile, 'export {}\n')
  return {
    transactionId: randomUUID(),
    pluginId: 'demo',
    hmrEntryId: HMR_ID,
    reportPath,
    expectedPid: process.pid,
    expectedEntryUrl: targetUrl(root),
    targetScope: 'root',
    targetEntryId: 'demo',
    targetEntryName: 'demo',
    targetFiles: [realpathSync(targetFile)],
    ...fields,
  }
}

function mountObserver(runtime, root, reportPath, fields = {}) {
  const config = observerConfig(root, reportPath, fields)
  runtime.prepareAudit(config)
  apply(runtime.ctx, config)
  return config
}

test('reports every preset-private target generation through reload and temporary-scope cleanup', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dshx-hmr-observer-'))
  try {
    const reportPath = join(root, 'report.json')
    const oldA = fiber()
    const oldB = fiber()
    const oldRuntime = pluginRuntime(oldA, oldB)
    const hmr = fiber(PENDING)
    const anchor = { id: 'preset-anchor', options: { id: 'preset-anchor', name: 'demo-runtime' }, disabled: true }
    const runtime = harness([anchor, entry(HMR_ID, hmr)], [oldRuntime])
    mountObserver(runtime, root, reportPath, {
      targetScope: 'preset', targetEntryId: 'preset-anchor', targetEntryName: 'demo-runtime',
    })

    await runtime.poll()
    assert.throws(() => readFileSync(reportPath), /ENOENT/)
    hmr.state = ACTIVE
    await runtime.poll()
    const ready = report(reportPath)
    assert.equal(ready.phase, 'READY')
    assert.equal(ready.pid, process.pid)
    assert.equal(ready.samePid, true)
    assert.equal(ready.targetGenerationIds.length, 2)
    assert.equal(new Set(ready.targetGenerationIds).size, 2)
    assert.deepEqual(ready.targetGenerationStates, ready.targetGenerationIds.map(generationId => ({ generationId, state: 'ACTIVE' })))
    assert.equal(statSync(reportPath).mode & 0o777, 0o600)

    const nextA = fiber()
    const nextB = fiber()
    const nextRuntime = pluginRuntime(nextA, nextB)
    runtime.setRuntimes([nextRuntime])
    await runtime.poll()
    assert.equal(report(reportPath).phase, 'READY')
    runtime.emit('hmr/reload', new Map([
      ['old', { filename: targetUrl(root), runtime: oldRuntime }],
    ]))
    await runtime.poll()
    assert.equal(report(reportPath).phase, 'READY')
    assert.equal(oldA.disposeCalls, 0)
    assert.equal(oldB.disposeCalls, 0)
    oldA.state = LOADING
    oldB.state = PENDING
    await runtime.poll()
    assert.equal(report(reportPath).phase, 'READY')
    assert.equal(oldA.disposeCalls, 0)
    assert.equal(oldB.disposeCalls, 0)
    oldA.state = DISPOSED
    oldB.state = DISPOSED
    await runtime.poll()
    const reloaded = report(reportPath)
    assert.equal(reloaded.phase, 'MODULE_RELOADED')
    assert.equal(reloaded.moduleReloaded.samePid, true)
    assert.deepEqual(reloaded.moduleReloaded.oldGenerationIds, ready.targetGenerationIds)
    assert.equal(reloaded.moduleReloaded.newGenerationIds.length, 2)
    assert.equal(reloaded.moduleReloaded.newGenerationIds.some(id => ready.targetGenerationIds.includes(id)), false)
    assert.deepEqual(reloaded.moduleReloaded.hmrEventMatchedGenerationIds, ready.targetGenerationIds)
    assert.equal(oldA.disposeCalls, 1)
    assert.equal(oldB.disposeCalls, 1)
    assert.equal(nextA.disposeCalls, 0)
    assert.equal(nextB.disposeCalls, 0)

    runtime.setEntries([])
    await runtime.poll()
    const cleaned = report(reportPath)
    assert.equal(cleaned.phase, 'HMR_DISPOSED')
    assert.equal(hmr.disposeCalls, 1)
    assert.deepEqual(cleaned.moduleReloaded, reloaded.moduleReloaded)

    await runtime.dispose()
    const disposed = report(reportPath)
    assert.equal(disposed.phase, 'OBSERVER_DISPOSED')
    assert.deepEqual(disposed.moduleReloaded, reloaded.moduleReloaded)
    assert.deepEqual(disposed.hmrDisposed, cleaned.hmrDisposed)
    assert.equal(runtime.timerCancelled(), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('recovers a runtime-identifiable FAILED target without claiming it was ACTIVE at READY', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dshx-hmr-observer-'))
  try {
    const reportPath = join(root, 'report.json')
    const old = fiber(FAILED)
    const hmr = fiber()
    const runtime = harness([entry('demo', old), entry(HMR_ID, hmr)])
    mountObserver(runtime, root, reportPath)

    await runtime.poll()
    const ready = report(reportPath)
    assert.equal(ready.phase, 'READY')
    assert.deepEqual(ready.targetGenerationStates, [{
      generationId: ready.targetGenerationIds[0],
      state: 'FAILED',
    }])

    const next = fiber(ACTIVE)
    runtime.emit('hmr/reload', [{ filename: targetUrl(root), runtime: old.runtime }])
    old.state = DISPOSED
    runtime.setEntries([entry('demo', next), entry(HMR_ID, hmr)])
    await runtime.poll()
    const reloaded = report(reportPath)
    assert.equal(reloaded.phase, 'MODULE_RELOADED')
    assert.deepEqual(reloaded.targetGenerationStates, ready.targetGenerationStates)
    assert.equal(reloaded.moduleReloaded.samePid, true)
    assert.deepEqual(reloaded.moduleReloaded.hmrEventMatchedGenerationIds, ready.targetGenerationIds)
    assert.equal(old.disposeCalls, 1)
    assert.equal(next.disposeCalls, 0)

    runtime.setEntries([entry('demo', next)])
    await runtime.poll()
    assert.equal(report(reportPath).phase, 'HMR_DISPOSED')
    await runtime.dispose()
    const disposed = report(reportPath)
    assert.equal(disposed.phase, 'OBSERVER_DISPOSED')
    assert.deepEqual(disposed.targetGenerationStates, ready.targetGenerationStates)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('does not become READY while an original target is PENDING or LOADING', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dshx-hmr-observer-'))
  try {
    const reportPath = join(root, 'report.json')
    const pending = fiber(PENDING)
    const hmr = fiber()
    const runtime = harness([
      entry('demo', pending),
      entry(HMR_ID, hmr),
    ])
    mountObserver(runtime, root, reportPath)

    await runtime.poll()
    assert.throws(() => readFileSync(reportPath), /ENOENT/)
    pending.state = LOADING
    await runtime.poll()
    assert.throws(() => readFileSync(reportPath), /ENOENT/)
    pending.state = FAILED
    await runtime.poll()
    assert.deepEqual(report(reportPath).targetGenerationStates.map(target => target.state), ['FAILED'])
    await runtime.dispose()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('does not call an ordinary equal-count fiber reconfigure a module reload without the public HMR event', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dshx-hmr-observer-'))
  try {
    const reportPath = join(root, 'report.json')
    const old = fiber()
    const hmr = fiber()
    const runtime = harness([entry('demo', old), entry(HMR_ID, hmr)])
    mountObserver(runtime, root, reportPath)
    await runtime.poll()
    old.state = DISPOSED
    runtime.setEntries([entry('demo', fiber()), entry(HMR_ID, hmr)])
    await runtime.poll()
    assert.equal(report(reportPath).phase, 'READY')
    assert.equal(old.disposeCalls, 0)
    await runtime.dispose()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('requires the public HMR event to name the exact canonical Loader entry URL', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dshx-hmr-observer-'))
  try {
    const reportPath = join(root, 'report.json')
    writeFileSync(join(root, 'target.js'), 'export {}\n')
    const expectedEntryUrl = targetUrl(root)
    const old = fiber()
    const next = fiber()
    const hmr = fiber()
    const runtime = harness([entry('demo', old), entry(HMR_ID, hmr)])
    mountObserver(runtime, root, reportPath, { expectedEntryUrl })
    await runtime.poll()
    old.state = DISPOSED
    runtime.setEntries([entry('demo', next), entry(HMR_ID, hmr)])
    runtime.emit('hmr/reload', [{
      filename: pathToFileURL(join(root, 'unrelated.js')).href,
      runtime: old.runtime,
    }])
    await runtime.poll()
    assert.equal(report(reportPath).phase, 'READY')
    assert.equal(old.disposeCalls, 0)

    runtime.emit('hmr/reload', [{ filename: expectedEntryUrl, runtime: old.runtime }])
    await runtime.poll()
    assert.equal(report(reportPath).phase, 'MODULE_RELOADED')
    assert.equal(old.disposeCalls, 1)
    assert.doesNotMatch(JSON.stringify(report(reportPath)), /target\.js|unrelated\.js|file:\/\//)
    await runtime.dispose()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('does not report reload when the replacement generation count shrinks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dshx-hmr-observer-'))
  try {
    const reportPath = join(root, 'report.json')
    const oldA = fiber()
    const oldB = fiber()
    const oldRuntime = pluginRuntime(oldA, oldB)
    const hmr = fiber()
    const anchor = { id: 'preset-anchor', options: { id: 'preset-anchor', name: 'demo-runtime' }, disabled: true }
    const runtime = harness([anchor, entry(HMR_ID, hmr)], [oldRuntime])
    mountObserver(runtime, root, reportPath, {
      targetScope: 'preset', targetEntryId: 'preset-anchor', targetEntryName: 'demo-runtime',
    })
    await runtime.poll()
    runtime.emit('hmr/reload', [
      { filename: targetUrl(root), runtime: oldRuntime },
    ])
    oldA.state = DISPOSED
    oldB.state = DISPOSED
    runtime.setRuntimes([pluginRuntime(fiber())])
    await runtime.poll()
    assert.equal(report(reportPath).phase, 'READY')
    assert.equal(oldA.disposeCalls, 0)
    assert.equal(oldB.disposeCalls, 0)
    await runtime.dispose()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('publishes a fixed failure classification without leaking a disposal error', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dshx-hmr-observer-'))
  try {
    const reportPath = join(root, 'report.json')
    const old = fiber(ACTIVE, { disposeError: 'secret source path /private/plugin.ts' })
    const hmr = fiber()
    const runtime = harness([entry('demo', old), entry(HMR_ID, hmr)])
    mountObserver(runtime, root, reportPath)
    await runtime.poll()
    runtime.emit('hmr/reload', [{ filename: targetUrl(root), runtime: old.runtime }])
    old.state = DISPOSED
    runtime.setEntries([entry('demo', fiber()), entry(HMR_ID, hmr)])
    await runtime.poll()
    const failed = report(reportPath)
    assert.equal(failed.phase, 'FAILED')
    assert.equal(failed.failure.code, 'TARGET_DISPOSE_WAIT_FAILED')
    assert.doesNotMatch(JSON.stringify(failed), /secret|private|plugin\.ts/)
    await runtime.dispose()
    const disposed = report(reportPath)
    assert.equal(disposed.phase, 'OBSERVER_DISPOSED')
    assert.equal(disposed.failure.code, 'TARGET_DISPOSE_WAIT_FAILED')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('does not report reload or dispose old fibers while any replacement is pending or failed', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dshx-hmr-observer-'))
  try {
    const reportPath = join(root, 'report.json')
    const old = fiber()
    const hmr = fiber()
    const runtime = harness([entry('demo', old), entry(HMR_ID, hmr)])
    mountObserver(runtime, root, reportPath)
    await runtime.poll()
    assert.equal(report(reportPath).phase, 'READY')

    runtime.setEntries([entry('demo', fiber(PENDING)), entry(HMR_ID, hmr)])
    await runtime.poll()
    assert.equal(report(reportPath).phase, 'READY')
    runtime.setEntries([entry('demo', fiber(FAILED)), entry(HMR_ID, hmr)])
    await runtime.poll()
    assert.equal(report(reportPath).phase, 'READY')
    assert.equal(old.disposeCalls, 0)
    await runtime.dispose()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('accepts one exact public options id/name target with a qualified Include entry id', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dshx-hmr-observer-'))
  try {
    const reportPath = join(root, 'report.json')
    const selected = fiber()
    const hmr = fiber()
    const includedEntry = { id: 'include:demo', options: { id: 'demo', name: 'demo' }, fiber: selected }
    selected.entry = includedEntry
    const runtime = harness([includedEntry, entry(HMR_ID, hmr)])
    mountObserver(runtime, root, reportPath)
    await runtime.poll()
    const ready = report(reportPath)
    assert.equal(ready.phase, 'READY')
    assert.equal(ready.targetGenerationIds.length, 1)
    await runtime.dispose()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('fails closed when root scope would reload another live fiber of the same runtime', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dshx-hmr-observer-'))
  try {
    const reportPath = join(root, 'report.json')
    const selected = fiber()
    const outside = fiber()
    pluginRuntime(selected, outside)
    const hmr = fiber()
    const runtime = harness([entry('demo', selected), entry(HMR_ID, hmr)])
    mountObserver(runtime, root, reportPath)
    await runtime.poll()
    assert.equal(report(reportPath).failure.code, 'ROOT_RUNTIME_SCOPE_AMBIGUOUS')
    await runtime.dispose()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects preset scope when the target runtime is also present in the root Loader tree', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dshx-hmr-observer-'))
  try {
    const reportPath = join(root, 'report.json')
    const target = fiber()
    const targetRuntime = pluginRuntime(target)
    const hmr = fiber()
    const anchor = { id: 'preset-anchor', options: { id: 'preset-anchor', name: 'demo-runtime' }, disabled: true }
    const rootTarget = { id: 'root-demo', options: { id: 'root-demo', name: 'demo-runtime' }, fiber: target }
    const runtime = harness([anchor, rootTarget, entry(HMR_ID, hmr)], [targetRuntime])
    mountObserver(runtime, root, reportPath, {
      targetScope: 'preset', targetEntryId: 'preset-anchor', targetEntryName: 'demo-runtime',
    })
    await runtime.poll()
    assert.equal(report(reportPath).failure.code, 'PRESET_ROOT_SCOPE_PRESENT')
    await runtime.dispose()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects a matched public HMR event that also reloads another runtime', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dshx-hmr-observer-'))
  try {
    const reportPath = join(root, 'report.json')
    const old = fiber()
    const hmr = fiber()
    const runtime = harness([entry('demo', old), entry(HMR_ID, hmr)])
    mountObserver(runtime, root, reportPath)
    await runtime.poll()
    assert.equal(report(reportPath).phase, 'READY')
    runtime.emit('hmr/reload', [
      { filename: targetUrl(root), runtime: old.runtime },
      { filename: pathToFileURL(join(root, 'other.js')).href, runtime: {} },
    ])
    await runtime.poll()
    assert.equal(report(reportPath).failure.code, 'HMR_EVENT_SCOPE_EXCEEDED')
    await runtime.dispose()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects unbound or over-broad observer configuration before registering effects', () => {
  assert.deepEqual(inject, ['loader', 'timer'])
  const runtime = harness([])
  const base = observerConfig('/tmp', '/tmp/report.json')
  assert.throws(() => apply(runtime.ctx, { ...base, expectedPid: process.pid + 1 }), /expectedPid/)
  assert.throws(() => apply(runtime.ctx, { ...base, pluginId: '../demo' }), /kebab-case/)
  assert.throws(() => apply(runtime.ctx, { ...base, expectedEntryUrl: '/tmp/demo.js' }), /exact file URL/)
  assert.throws(() => apply(runtime.ctx, { ...base, expectedEntryUrl: 'https://example.com/demo.js' }), /exact file URL/)
  assert.throws(() => apply(runtime.ctx, { ...base, command: 'restart' }), /unsupported field command/)
})
