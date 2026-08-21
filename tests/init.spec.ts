import assert from 'node:assert/strict'
import { lstatSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { cmdInit, scaffoldCreatorPlugin } from '../src/commands/init.ts'
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
    const pkg = loadJson<{
      exports: Record<string, string | { default: string }>,
      scripts: Record<string, string>,
    }>(join(root, 'my-plugins/client-demo/package.json'))
    assert.deepEqual(pkg.exports['./client'], {
      types: './lib/types/client/index.d.ts',
      default: './lib/client.js',
    })
    assert.equal(pkg.scripts.build, 'tsc -p tsconfig.json && tsdown')
    assert.match(readFileSync(join(root, 'my-plugins/client-demo/tsdown.config.ts'), 'utf8'), /externalClientBundle/)
    assert.match(readFileSync(join(root, 'my-plugins/client-demo/tsconfig.json'), 'utf8'), /tsconfig\.base\.client\.json/)
    const findings = checkPlugin(loadPlugin(root, 'client-demo'), root)
    assert.ok(findings.some(item => item.code === 'rc8-external-client-build' && item.level === 'ok'), JSON.stringify(findings, null, 2))
    assert.ok(findings.some(item => item.code === 'client-entry' && item.level === 'error'), JSON.stringify(findings, null, 2))
  })

  it('scaffolds Creator source inside the trusted session workspace and links my-plugins automatically', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-creator-scaffold-root-'))
    const workspace = mkdtempSync(join(tmpdir(), 'dshx-creator-scaffold-workspace-'))
    const result = scaffoldCreatorPlugin(root, workspace, 'client-demo', 'client')
    const source = join(realpathSync(workspace), 'client-demo')
    const linked = join(root, 'my-plugins/client-demo')

    assert.equal(result.dir, source)
    assert.equal(result.linkPath, linked)
    assert.equal(lstatSync(linked).isSymbolicLink(), true)
    assert.equal(realpathSync(linked), realpathSync(source))
    assert.equal(loadPlugin(root, 'client-demo').dir, linked)

    const tsconfig = readFileSync(join(source, 'tsconfig.json'), 'utf8')
    assert.doesNotMatch(tsconfig, /tsconfig\.base\.client|\/Users\//)
    const buildConfig = readFileSync(join(source, 'tsdown.config.ts'), 'utf8')
    assert.match(buildConfig, /\.config\/dshx\/harness/)
    assert.match(buildConfig, /externalClientBundle/)
    assert.doesNotMatch(buildConfig, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  })
})
