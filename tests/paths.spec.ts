import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { findRepoRoot, isHarnessCheckout, resolveHarness, writeHarnessConfig } from '../src/internal/paths.ts'
import { writeText } from '../src/internal/io.ts'

function fakeHarness(parent: string, name: string, withDshx = true): string {
  const root = join(parent, name)
  writeText(join(root, 'apps/cli/src/bin.ts'), 'export {}\n')
  if (withDshx) writeText(join(root, 'tools/dshx/src/cli.ts'), 'export {}\n')
  return root
}

function isolateConfig(tmp: string): () => void {
  const prevXdg = process.env.XDG_CONFIG_HOME
  const prevEnv = process.env.DSHX_HARNESS
  process.env.XDG_CONFIG_HOME = join(tmp, 'xdg')
  mkdirSync(join(tmp, 'xdg'), { recursive: true })
  delete process.env.DSHX_HARNESS
  return () => {
    if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = prevXdg
    if (prevEnv === undefined) delete process.env.DSHX_HARNESS
    else process.env.DSHX_HARNESS = prevEnv
  }
}

describe('resolveHarness', () => {
  it('walks up to a checkout that has tools/dshx', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dshx-paths-'))
    const restore = isolateConfig(tmp)
    try {
      const root = fakeHarness(tmp, 'h')
      const nested = join(root, 'my-plugins', 'demo')
      mkdirSync(nested, { recursive: true })
      const found = resolveHarness({ start: nested, requireDshx: true })
      assert.equal(found.ok, true)
      assert.equal(found.root, root)
      assert.equal(found.source, 'walk')
    } finally {
      restore()
    }
  })

  it('honors DSHX_HARNESS and rejects a bad env value', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dshx-paths-'))
    const restore = isolateConfig(tmp)
    try {
      const root = fakeHarness(tmp, 'h')
      process.env.DSHX_HARNESS = root
      const found = resolveHarness({ start: tmp, requireDshx: true })
      assert.equal(found.root, root)
      assert.equal(found.source, 'env')
      process.env.DSHX_HARNESS = join(tmp, 'nope')
      const bad = resolveHarness({ start: tmp, requireDshx: true })
      assert.equal(bad.ok, false)
      assert.match(bad.message ?? '', /DSHX_HARNESS/)
    } finally {
      restore()
    }
  })

  it('reads XDG config and errors when env and config disagree', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dshx-paths-'))
    const restore = isolateConfig(tmp)
    try {
      const a = fakeHarness(tmp, 'a')
      const b = fakeHarness(tmp, 'b')
      writeHarnessConfig(a)
      const fromConfig = resolveHarness({ start: tmp, requireDshx: true })
      assert.equal(fromConfig.root, a)
      assert.equal(fromConfig.source, 'config')
      process.env.DSHX_HARNESS = b
      const both = resolveHarness({ start: tmp, requireDshx: true })
      assert.equal(both.ok, false)
      assert.match(both.message ?? '', /multiple/)
    } finally {
      restore()
    }
  })

  it('lets an explicit --harness disambiguate conflicting discovery sources', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dshx-paths-'))
    const restore = isolateConfig(tmp)
    try {
      const selected = fakeHarness(tmp, 'selected')
      const configured = fakeHarness(tmp, 'configured')
      const environment = fakeHarness(tmp, 'environment')
      writeHarnessConfig(configured)
      process.env.DSHX_HARNESS = environment
      const found = resolveHarness({ start: configured, flag: selected, requireDshx: true })
      assert.equal(found.ok, true)
      assert.equal(found.root, selected)
      assert.equal(found.source, 'flag')
      assert.equal(findRepoRoot(configured, selected), selected)
    } finally {
      restore()
    }
  })

  it('setup mode can see a checkout before tools/dshx exists', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dshx-paths-'))
    const restore = isolateConfig(tmp)
    try {
      const root = fakeHarness(tmp, 'bare', false)
      assert.equal(isHarnessCheckout(root, false), true)
      assert.equal(isHarnessCheckout(root, true), false)
      const found = resolveHarness({ start: root, requireDshx: false })
      assert.equal(found.root, root)
    } finally {
      restore()
    }
  })

  it('findRepoRoot throws a useful error', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dshx-paths-'))
    const restore = isolateConfig(tmp)
    try {
      writeFileSync(join(tmp, 'readme.txt'), 'no')
      assert.throws(() => findRepoRoot(tmp), /cannot find a DeepSeek Harness checkout/)
    } finally {
      restore()
    }
  })
})
