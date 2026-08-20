import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, it } from 'node:test'

describe('Creator+ browser sentry', () => {
  it('is a self-contained lazy-CJS client that reports an exact FAILED loader entry', async () => {
    const source = readFileSync(join(import.meta.dirname, '../src/creator-plus/client.js'), 'utf8')
    let registration: Record<string, unknown> | undefined
    let statusListener: ((fiber: Record<string, unknown>) => void) | undefined
    let request: { path: string; options: Record<string, unknown> } | undefined
    const storage = new Map<string, string>()
    let reloaded = false
    class Observer {
      observe(): void {}
      disconnect(): void {}
    }
    runInNewContext(source, {
      window: { __ModuleLoader__: { load(value: Record<string, unknown>) { registration = value } } },
      document: { documentElement: {}, querySelector: () => null },
      MutationObserver: Observer,
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      location: { reload() { reloaded = true } },
      fetch: async (path: string, options: Record<string, unknown>) => {
        request = { path, options }
        return { ok: true, json: async () => ({ reload: true }) }
      },
      console,
      setTimeout,
      clearTimeout,
    })
    assert.equal(registration?.id, 'dsh-external-plugin-devkit')
    const exports = (registration!.factory as () => Record<string, unknown>)()
    assert.deepEqual(Array.from(exports.inject as string[]), ['loader'])
    ;(exports.apply as (ctx: Record<string, unknown>) => void)({
      loader: { entries: () => [] },
      on(event: string, listener: (fiber: Record<string, unknown>) => void) {
        if (event === 'internal/status') statusListener = listener
      },
      effect() {},
    })
    statusListener!({ state: 3, entry: { options: { name: 'broken-client' } } })
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(request?.path, '/dshx-creator-plus/client-failure')
    assert.deepEqual(JSON.parse(request!.options.body as string), {
      failedIds: ['broken-client'],
      message: 'client loader entry broken-client entered FAILED',
    })
    assert.equal(reloaded, true)
  })
})
