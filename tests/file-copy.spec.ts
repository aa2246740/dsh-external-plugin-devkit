import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { checkPlugin } from '../src/internal/check.ts'
import { clientEntryFindings, resolveFileSpec } from '../src/internal/file-copy.ts'
import { writeText } from '../src/internal/io.ts'
import { loadPlugin } from '../src/internal/plugin.ts'
import { resolveShipTarget } from '../src/internal/ship.ts'

describe('file: helpers', () => {
  it('resolves file: specs against the profile directory', () => {
    const spec = resolveFileSpec('file:/tmp/pkg', '/unused')
    assert.equal(spec, '/tmp/pkg')
    const rel = resolveFileSpec('file:../work/pkg', '/home/u/.dsh/profiles/web')
    assert.ok(rel?.endsWith('/work/pkg'))
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

  it('resolves a ship target from a package directory', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dshx-ship-'))
    writeText(join(tmp, 'pkg/package.json'), `${JSON.stringify({ name: 'demo-pack', version: '1.2.3' })}\n`)
    const target = resolveShipTarget(tmp, join(tmp, 'profile'), join(tmp, 'pkg'))
    assert.equal(target.name, 'demo-pack')
    assert.ok(target.source.endsWith('/pkg'))
  })
})
