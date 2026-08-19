import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { cmdShip } from '../src/commands/ship.ts'
import { checkPlugin } from '../src/internal/check.ts'
import { clientEntryFindings, resolveFileSpec, resolveLocalSpec, treeHash } from '../src/internal/file-copy.ts'
import { parseCli, writeText } from '../src/internal/io.ts'
import { loadPlugin } from '../src/internal/plugin.ts'
import { preserveBundleOrder, resolveShipTarget } from '../src/internal/ship.ts'

describe('file: helpers', () => {
  it('resolves file: specs against the profile directory', () => {
    const spec = resolveFileSpec('file:/tmp/pkg', '/unused')
    assert.equal(spec, '/tmp/pkg')
    const rel = resolveFileSpec('file:../work/pkg', '/home/u/.dsh/profiles/web')
    assert.ok(rel?.endsWith('/work/pkg'))
    const link = resolveLocalSpec('link:../work/pkg', '/home/u/.dsh/profiles/web')
    assert.ok(link?.endsWith('/work/pkg'))
  })

  it('flags a missing .js client entry when only .mjs exists', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dshx-client-'))
    writeText(join(tmp, 'package.json'), `${JSON.stringify({
      name: 'demo',
      exports: { './client': './lib/client.js' },
      dsh: { client: { inject: [] } },
    }, null, 2)}\n`)
    writeText(join(tmp, 'lib/client.mjs'), 'export {}\n')
    const findings = clientEntryFindings(tmp)
    assert.ok(findings.some(item => item.code === 'client-entry' && item.level === 'error'), JSON.stringify(findings))
  })

  it('checkPlugin includes client-entry for a packaged client plugin', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-check-client-'))
    const dir = join(root, 'my-plugins', 'panel')
    writeText(join(dir, 'dshx.yml'), 'id: panel\nentry: src/panel.ts\nmarker: "[my-plugins/panel] loaded"\nkind: client\n')
    writeText(join(dir, 'src/panel.ts'), `export const name = 'panel'
export const inject = []
export function apply() { console.log('[my-plugins/panel] loaded') }
`)
    writeText(join(dir, 'package.json'), `${JSON.stringify({
      name: 'panel',
      exports: { './client': './lib/client.js' },
      dsh: { client: { inject: [] } },
    }, null, 2)}\n`)
    writeText(join(dir, 'lib/client.mjs'), 'export {}\n')
    const findings = checkPlugin(loadPlugin(root, 'panel'), root)
    assert.ok(findings.some(item => item.code === 'client-entry' && item.level === 'error'))
  })

  it('rejects a source TSX client export even when the file exists', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dshx-client-source-'))
    writeText(join(tmp, 'package.json'), `${JSON.stringify({
      name: 'demo',
      exports: { './client': './src/client/index.tsx' },
      dsh: { client: { inject: [] } },
    })}\n`)
    writeText(join(tmp, 'src/client/index.tsx'), 'export function apply() {}\n')
    const findings = clientEntryFindings(tmp)
    assert.ok(findings.some(item => item.code === 'client-entry-format' && item.level === 'error'), JSON.stringify(findings))
  })

  it('accepts a built lazy-CJS client handoff', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dshx-client-built-'))
    writeText(join(tmp, 'package.json'), `${JSON.stringify({
      name: 'demo',
      exports: { './client': './lib/client.js' },
      dsh: { client: { inject: [] } },
    })}\n`)
    writeText(join(tmp, 'lib/client.js'), 'window.__ModuleLoader__.load({ id: "demo", factory: (require) => ({ apply() {} }) });\n')
    const findings = clientEntryFindings(tmp)
    assert.ok(findings.some(item => item.code === 'client-entry' && item.level === 'ok'), JSON.stringify(findings))
    assert.equal(findings.some(item => item.level === 'error'), false, JSON.stringify(findings))
  })

  it('hashes artifact contents and preserves bundle precedence', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dshx-hash-'))
    writeText(join(tmp, 'a/lib/index.js'), 'one\n')
    writeText(join(tmp, 'b/lib/index.js'), 'one\n')
    assert.equal(treeHash(join(tmp, 'a/lib')), treeHash(join(tmp, 'b/lib')))
    writeText(join(tmp, 'b/lib/index.js'), 'two\n')
    assert.notEqual(treeHash(join(tmp, 'a/lib')), treeHash(join(tmp, 'b/lib')))
    assert.deepEqual(preserveBundleOrder(['base', 'demo', 'web'], ['base', 'web', 'demo', 'new']), ['base', 'demo', 'web', 'new'])
  })

  it('resolves a ship target from a package directory', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dshx-ship-'))
    writeText(join(tmp, 'pkg/package.json'), `${JSON.stringify({ name: 'demo-pack', version: '1.2.3' })}\n`)
    const target = resolveShipTarget(tmp, join(tmp, 'profile'), join(tmp, 'pkg'))
    assert.equal(target.name, 'demo-pack')
    assert.ok(target.source.endsWith('/pkg'))
  })

  it('rejects the old --restart chain before touching a profile', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-ship-'))
    const { options } = parseCli(['sync-artifact', './pkg', '--restart', '--json'])
    const write = process.stdout.write.bind(process.stdout)
    process.stdout.write = (() => true) as typeof process.stdout.write
    try {
      assert.equal(await cmdShip(['./pkg'], options, root), 1)
    } finally {
      process.stdout.write = write
    }
  })
})
