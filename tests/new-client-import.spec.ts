import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { apply } from '../src/runtime/new-client-import-observer.mjs'

function fixture(mounted = false) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'dshx-import-observer-test-')))
  const entryPath = join(directory, 'index.js')
  writeFileSync(entryPath, 'export const name = "demo"')
  const config = { expectedPid: process.pid, transactionId: 'test', pluginId: 'demo',
    hmrEntryId: 'dshx-hot-reload-hmr-12345678123442348234123456789abc',
    targetFiles: [entryPath], entryPath, reportPath: join(directory, 'report.json') }
  const callback = function officialHmr() {}
  const entry: any = { options: { id: config.hmrEntryId, name: '@deepseek-ai/cordis-plugin-hmr' } }
  let hmrDisposed = 0, cancelCount = 0, dispose: any, tick: any
  const fiber: any = { state: 2, config: { root: ['index.js'] }, entry, async dispose() { hmrDisposed++; fiber.state = 4 } }
  fiber.ctx = { hmr: { config: fiber.config, baseDir: directory, ctx: { fiber } } }
  // Loader exposes a fork view, as the real Cordis Host does.
  entry.fiber = new Proxy(fiber, {})
  const target: any = { name: 'demo', fibers: mounted ? [{ state: 2 }] : [] }
  const registry = new Map<any, any>([[callback, { callback, fibers: [fiber] }], [target, target]])
  const events = new Map<string, Function>()
  const ctx = {
    registry,
    loader: { entries: () => [entry], async import() { return callback }, unwrapExports: (value: any) => value },
    on(name: string, listener: Function) { events.set(name, listener) },
    setInterval(listener: Function) { tick = listener; return () => { cancelCount++ } },
    effect(cleanup: Function) { dispose = cleanup() },
  }
  const flush = () => new Promise<void>(resolve => setImmediate(resolve))
  const read = () => existsSync(config.reportPath) ? JSON.parse(readFileSync(config.reportPath, 'utf8')) : undefined
  return { config, ctx, target, fiber, events, read, flush, tick: async () => { tick(); await flush() },
    async clean() { if (dispose) await dispose(); rmSync(directory, { recursive: true, force: true }) },
    async dispose() { await dispose(); assert.equal(read().disposed, true); assert.equal(hmrDisposed, 1); assert.equal(cancelCount, 1) } }
}

test('prepares an uncached entry only after its exact file event and cleans the temporary HMR fiber', async () => {
  const f = fixture()
  try {
    apply(f.ctx, f.config)
    await f.tick()
    assert.equal(f.read().phase, 'READY')
    f.events.get('hmr/change')!(pathToFileURL('/tmp/unrelated.js').href)
    await f.flush()
    assert.equal(f.read().phase, 'READY')
    f.events.get('hmr/change')!(pathToFileURL(f.config.entryPath).href)
    await f.flush()
    assert.equal(f.read().phase, 'IMPORT_READY')
    assert.equal(f.read().evidence, 'uncached-entry-change')
    await f.dispose()
  } finally { await f.clean() }
})

test('accepts official HMR completion for a failed unmounted import', async () => {
  const f = fixture()
  try {
    apply(f.ctx, f.config)
    await f.tick()
    f.events.get('hmr/reload')!(new Map())
    await f.flush()
    assert.equal(f.read().evidence, 'official-hmr-unmounted-import')
  } finally { await f.clean() }
})

test('leaves an already mounted target to its ordinary lifecycle without touching source', async () => {
  const f = fixture(true)
  try {
    apply(f.ctx, f.config)
    await f.tick()
    assert.equal(f.read().phase, 'ALREADY_MOUNTED')
    f.events.get('hmr/reload')!(new Map())
    await f.flush()
    assert.equal(f.read().phase, 'ALREADY_MOUNTED')
  } finally { await f.clean() }
})

test('recognizes a mounted package by its Loader entry when the plugin has no exported name', async () => {
  const f = fixture()
  try {
    const entries = [...f.ctx.loader.entries(), { options: { name: 'demo' }, fiber: { state: 2 } }]
    f.ctx.loader.entries = () => entries
    apply(f.ctx, f.config)
    await f.tick()
    assert.equal(f.read().phase, 'ALREADY_MOUNTED')
  } finally { await f.clean() }
})

test('cannot claim import preparation from a runtime replacement or a concurrent target mount', async () => {
  for (const runtimeReplacement of [true, false]) {
    const f = fixture()
    try {
      apply(f.ctx, f.config)
      await f.tick()
      if (runtimeReplacement) f.events.get('hmr/reload')!(new Map([[{}, { runtime: {} }]]))
      else {
        f.target.fibers.push({ state: 2 })
        f.events.get('hmr/change')!(pathToFileURL(f.config.entryPath).href)
      }
      await f.flush()
      assert.equal(f.read().phase, 'FAILED')
      assert.match(f.read().error, runtimeReplacement ? /existing runtime/ : /became mounted/)
    } finally { await f.clean() }
  }
})

test('fails before installing effects in a different Host process', () => {
  const f = fixture()
  try { assert.throws(() => apply(f.ctx, { ...f.config, expectedPid: process.pid + 1 }), /PID mismatch/) }
  finally { void f.clean() }
})
