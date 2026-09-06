import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { auditActiveHmr } from '../src/runtime/hot-reload-hmr-audit.mjs'

const TRANSACTION = 'dshx-hot-reload-hmr-12345678123442348234123456789abc'
const ACTIVE = 2
const DISPOSED = 4

function fiber(id, baseDir, root, options = {}) {
  const value = {
    state: options.state ?? ACTIVE,
    config: { root },
    entry: {
      id: options.qualifiedId ?? id,
      options: { id, name: '@deepseek-ai/cordis-plugin-hmr' },
    },
  }
  const serviceFiber = options.foreignService ? {} : value
  value.ctx = { hmr: { config: value.config, baseDir, ctx: { fiber: serviceFiber } } }
  return value
}

function context(fibers) {
  const callback = function officialHmr() {}
  const exports = { default: callback }
  return {
    callback,
    ctx: {
      loader: {
        entries() {
          return fibers.filter(fiber => fiber.entry).map(fiber => fiber.entry)
        },
        async import(name) {
          assert.equal(name, '@deepseek-ai/cordis-plugin-hmr')
          return exports
        },
        unwrapExports(value) {
          assert.equal(value, exports)
          return value.default
        },
      },
      registry: {
        get(value) {
          assert.equal(value, callback)
          return { callback, fibers }
        },
      },
    },
  }
}

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dshx-hmr-audit-')))
  const targetDir = join(root, 'target')
  const otherDir = join(root, 'other')
  mkdirSync(targetDir)
  mkdirSync(otherDir)
  const first = join(targetDir, 'index.js')
  const second = join(targetDir, 'helper.js')
  writeFileSync(first, 'export const first = true\n')
  writeFileSync(second, 'export const second = true\n')
  return { root, targetDir, otherDir, first, second }
}

test('uses the official callback runtime and allows only exact transaction, root-empty fallback, and proved non-overlap', async () => {
  const test = fixture()
  try {
    const runtime = context([
      fiber('fallback-hmr', test.root, []),
      fiber(TRANSACTION, test.targetDir, ['index.js', 'helper.js'], { qualifiedId: `include:${TRANSACTION}` }),
      fiber('other-hmr', test.otherDir, ['.']),
      { state: DISPOSED },
    ])
    const result = await auditActiveHmr(runtime.ctx, {
      hmrEntryId: TRANSACTION,
      targetFiles: [test.first, test.second],
    })
    assert.deepEqual(result, {
      officialRuntimeFibers: 3,
      transactionFibers: 1,
      fallbackFibers: 1,
      nonOverlappingFibers: 1,
      targetFileCount: 2,
    })
  } finally {
    rmSync(test.root, { recursive: true, force: true })
  }
})

test('rejects duplicate or mismatched transaction HMR fibers', async () => {
  const test = fixture()
  try {
    await assert.rejects(() => auditActiveHmr(context([]).ctx, {
      hmrEntryId: TRANSACTION,
      targetFiles: [test.first],
    }), /exactly one active transaction/)
    await assert.rejects(() => auditActiveHmr(context([
      fiber(TRANSACTION, test.targetDir, ['index.js']),
      fiber(TRANSACTION, test.targetDir, ['index.js']),
    ]).ctx, {
      hmrEntryId: TRANSACTION,
      targetFiles: [test.first],
    }), /exactly one active transaction/)
    await assert.rejects(() => auditActiveHmr(context([
      fiber(TRANSACTION, test.targetDir, ['helper.js']),
    ]).ctx, {
      hmrEntryId: TRANSACTION,
      targetFiles: [test.first],
    }), /do not exactly match/)
  } finally {
    rmSync(test.root, { recursive: true, force: true })
  }
})

test('rejects overlapping, wildcard, non-real, unsettled, or non-isolated public HMR state', async () => {
  const test = fixture()
  try {
    const config = { hmrEntryId: TRANSACTION, targetFiles: [test.first] }
    const transaction = fiber(TRANSACTION, test.targetDir, ['index.js'])
    await assert.rejects(() => auditActiveHmr(context([
      transaction,
      fiber('overlap-hmr', test.root, ['target']),
    ]).ctx, config), /another watcher overlapping/)
    await assert.rejects(() => auditActiveHmr(context([
      fiber(TRANSACTION, test.targetDir, ['*.js']),
    ]).ctx, config), /dynamic or wildcard/)
    await assert.rejects(() => auditActiveHmr(context([
      fiber(TRANSACTION, test.targetDir, ['missing.js']),
    ]).ctx, config), /non-real watch root/)
    await assert.rejects(() => auditActiveHmr(context([
      fiber(TRANSACTION, test.targetDir, ['index.js'], { state: 0 }),
    ]).ctx, config), /unsettled official HMR fiber/)
    await assert.rejects(() => auditActiveHmr(context([
      fiber(TRANSACTION, test.targetDir, ['index.js'], { foreignService: true }),
    ]).ctx, config), /config\/baseDir\/service identity/)
  } finally {
    rmSync(test.root, { recursive: true, force: true })
  }
})

test('rejects paths, duplicates, unsupported fields, and missing public APIs before auditing', async () => {
  const test = fixture()
  try {
    const runtime = context([fiber(TRANSACTION, test.targetDir, ['index.js'])])
    await assert.rejects(() => auditActiveHmr(runtime.ctx, {
      hmrEntryId: TRANSACTION,
      targetFiles: ['relative.js'],
    }), /absolute real artifact files/)
    await assert.rejects(() => auditActiveHmr(runtime.ctx, {
      hmrEntryId: TRANSACTION,
      targetFiles: [test.first, test.first],
    }), /duplicates/)
    await assert.rejects(() => auditActiveHmr(runtime.ctx, {
      hmrEntryId: TRANSACTION,
      targetFiles: [test.first],
      command: 'restart',
    }), /unsupported field command/)
    await assert.rejects(() => auditActiveHmr({ loader: {}, registry: {} }, {
      hmrEntryId: TRANSACTION,
      targetFiles: [test.first],
    }), /public loader import and registry APIs/)
  } finally {
    rmSync(test.root, { recursive: true, force: true })
  }
})
