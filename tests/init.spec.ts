import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { cmdInit } from '../src/commands/init.ts'
import { checkPlugin } from '../src/internal/check.ts'
import { loadJson, parseCli } from '../src/internal/io.ts'
import { loadPlugin } from '../src/internal/plugin.ts'

function init(root: string, name: string, kind: string): number {
  const { options } = parseCli(['init', name, '--kind', kind, '--json'])
  const write = process.stdout.write.bind(process.stdout)
  process.stdout.write = (() => true) as typeof process.stdout.write
  try {
    return cmdInit([name], options, root)
  } finally {
    process.stdout.write = write
  }
}

describe('init scaffolds', () => {
  it('supports official object and class forms', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-init-'))
    assert.equal(init(root, 'object-demo', 'object'), 0)
    assert.equal(init(root, 'class-demo', 'class'), 0)
    for (const name of ['object-demo', 'class-demo']) {
      const findings = checkPlugin(loadPlugin(root, name), root)
      assert.equal(findings.some(item => item.level === 'error'), false, JSON.stringify(findings, null, 2))
    }
  })

  it('points client exports at lib/client.js and fails closed until it is built', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-init-'))
    assert.equal(init(root, 'client-demo', 'client'), 0)
    const pkg = loadJson<{ exports: Record<string, string> }>(join(root, 'my-plugins/client-demo/package.json'))
    assert.equal(pkg.exports['./client'], './lib/client.js')
    const findings = checkPlugin(loadPlugin(root, 'client-demo'), root)
    assert.ok(findings.some(item => item.code === 'client-entry' && item.level === 'error'), JSON.stringify(findings, null, 2))
  })
})
