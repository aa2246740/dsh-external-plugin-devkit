import assert from 'node:assert/strict'
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { cmdInit, scaffoldCreatorPlugin } from '../src/commands/init.ts'
import { checkPlugin } from '../src/internal/check.ts'
import { DSH_PEER_RANGE } from '../src/internal/types.ts'
import { loadJson, parseCli } from '../src/internal/io.ts'
import { loadPlugin, runtimePluginSpecifier } from '../src/internal/plugin.ts'

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

  it('scaffolds a resolvable package manifest for server plugins so they mount by name', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-init-'))
    assert.equal(init(root, 'fn-demo', 'function'), 0)
    const pkg = loadJson<{ name: string, private: boolean, exports: Record<string, string> }>(join(root, 'my-plugins/fn-demo/package.json'))
    assert.equal(pkg.name, 'fn-demo')
    assert.equal(pkg.private, true)
    assert.equal(pkg.exports['.'], './src/fn-demo.ts')
    assert.equal(runtimePluginSpecifier(loadPlugin(root, 'fn-demo')), 'fn-demo')
  })

  it('points client exports at lib/client.js and fails closed until it is built', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-init-'))
    assert.equal(init(root, 'client-demo', 'client'), 0)
    const pkg = loadJson<{
      exports: Record<string, string | { default: string }>,
      scripts: Record<string, string>,
      peerDependencies: Record<string, string>,
      devDependencies: Record<string, string>,
    }>(join(root, 'my-plugins/client-demo/package.json'))
    assert.deepEqual(pkg.exports['./client'], {
      types: './lib/types/client/index.d.ts',
      default: './lib/client.js',
    })
    assert.equal(pkg.scripts.build, 'tsc -p tsconfig.json && tsdown')
    assert.equal(pkg.peerDependencies['@deepseek-ai/dsh'], DSH_PEER_RANGE)
    assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-client-ui-renderer'], DSH_PEER_RANGE)
    assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-client-ui-layout'], DSH_PEER_RANGE)
    assert.equal(pkg.devDependencies['@deepseek-ai/dsh-client-runtime'], undefined)
    assert.equal(pkg.devDependencies['@deepseek-ai/dsh-client-ui-layout'], DSH_PEER_RANGE)
    assert.equal(pkg.devDependencies['@deepseek-ai/dsh-client-ui-renderer'], DSH_PEER_RANGE)
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
    assert.match(buildConfig, /if \(configured\) return resolve\(configured\)/)
    assert.doesNotMatch(buildConfig, /roots\.length\s*!==\s*1/)
    assert.doesNotMatch(buildConfig, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  })
})

// A plain client must not require the retired settings installation helper.
it('creates a client Host half that imports and mounts without optional settings APIs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dshx-client-import-'))
  const workspace = mkdtempSync(join(tmpdir(), 'dshx-client-workspace-'))
  try {
    scaffoldCreatorPlugin(root, workspace, 'plain-client-proof', 'client')
    const path = join(workspace, 'plain-client-proof/src/plain-client-proof.ts')
    const plugin = await import(path)
    assert.equal(plugin.name, 'plain-client-proof')
    assert.deepEqual(plugin.inject, [])
    await plugin.apply({})
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(workspace, { recursive: true, force: true }) }
})
