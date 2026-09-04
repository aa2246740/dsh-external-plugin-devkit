import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { renderOverlay } from '../src/internal/overlay.ts'
import { loadPlugin, runtimePluginSpecifier } from '../src/internal/plugin.ts'
import { ensureRuntimePackageLink } from '../src/internal/runtime-package.ts'
import { createApplyProbe } from '../src/internal/update-candidate.ts'

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

function clientHarness(): { root: string; plugin: string } {
  const root = mkdtempSync(join(tmpdir(), 'dshx-runtime-package-'))
  write(join(root, 'apps/cli/src/bin.ts'), 'export {}\n')
  write(join(root, 'tools/dshx/src/cli.ts'), 'export {}\n')
  const plugin = join(root, 'my-plugins', 'demo-client')
  write(join(plugin, 'src/index.ts'), "export function apply() { console.log('[demo] loaded') }\n")
  write(join(plugin, 'lib/index.js'), 'export function apply() {}\n')
  write(join(plugin, 'lib/client.js'), 'window.__ModuleLoader__.load({ id: "demo-client", factory: () => ({}) })\n')
  write(join(plugin, 'dshx.yml'), 'id: demo\nentry: src/index.ts\nmarker: "[demo] loaded"\nkind: client\nprofile: web\n')
  write(join(plugin, 'package.json'), JSON.stringify({
    name: 'demo-client',
    version: '1.0.0',
    type: 'module',
    main: './lib/index.js',
    exports: {
      '.': { types: './lib/types/index.d.ts', import: './lib/index.js' },
      './client': './lib/client.js',
      './package.json': './package.json',
    },
    dsh: { client: { platform: 'web' } },
  }))
  return { root, plugin }
}

describe('native runtime package seam', () => {
  it('renders web clients by package name and links the exact local checkout into the profile', () => {
    const { root, plugin: pluginDir } = clientHarness()
    const plugin = loadPlugin(root, 'demo-client')
    const home = join(root, 'runtime-home')
    const linked = ensureRuntimePackageLink(plugin, home, 'web')
    assert.equal(runtimePluginSpecifier(plugin), 'demo-client')
    assert.match(renderOverlay(plugin), /name: "demo-client"/)
    assert.equal(realpathSync(linked?.link ?? ''), realpathSync(pluginDir))
    assert.equal(linked?.entry, join(realpathSync(pluginDir), 'lib/index.js'))
  })

  it('keeps source-only plugins on the absolute TypeScript entry', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-runtime-source-'))
    write(join(root, 'apps/cli/src/bin.ts'), 'export {}\n')
    write(join(root, 'tools/dshx/src/cli.ts'), 'export {}\n')
    write(join(root, 'my-plugins/server/src/index.ts'), 'export function apply() {}\n')
    const plugin = loadPlugin(root, 'server')
    assert.equal(runtimePluginSpecifier(plugin), plugin.entryAbs)
    assert.match(renderOverlay(plugin), new RegExp(plugin.entryAbs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.equal(ensureRuntimePackageLink(plugin, join(root, 'home'), 'web'), undefined)
  })

  it('makes update probes package-resolvable without changing the staged client bundle', () => {
    const { root, plugin: pluginDir } = clientHarness()
    const probe = createApplyProbe(root, 'demo-client')
    const plugin = loadPlugin(root, probe.dir)
    const linked = ensureRuntimePackageLink(plugin, join(root, 'probe-home'), 'web')
    assert.equal(plugin.runtimePackage?.name, 'demo-client')
    assert.equal(plugin.runtimePackage?.webClient, true)
    assert.equal(runtimePluginSpecifier(plugin), 'demo-client')
    assert.equal(realpathSync(join(probe.dir, 'lib/client.js')), realpathSync(join(pluginDir, 'lib/client.js')))
    assert.equal(linked?.entry, realpathSync(join(probe.dir, 'src/probe.ts')))
  })

  it('probes a declared source lazy-CJS client without requiring lib', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-runtime-source-client-'))
    write(join(root, 'apps/cli/src/bin.ts'), 'export {}\n')
    write(join(root, 'tools/dshx/src/cli.ts'), 'export {}\n')
    const pluginDir = join(root, 'my-plugins', 'source-client')
    write(join(pluginDir, 'src/index.js'), 'export function apply() {}\n')
    write(join(pluginDir, 'src/client.js'), 'window.__ModuleLoader__.load({ id: "source-client", factory: () => ({}) })\n')
    write(join(pluginDir, 'dshx.yml'), 'id: source-client\nentry: src/index.js\nmarker: "[source-client] loaded"\nkind: client\nprofile: web\n')
    write(join(pluginDir, 'package.json'), JSON.stringify({
      name: 'source-client',
      version: '1.0.0',
      type: 'module',
      exports: {
        '.': './src/index.js',
        './client': './src/client.js',
        './package.json': './package.json',
      },
      dsh: { client: { platform: 'web' } },
    }))

    const probe = createApplyProbe(root, 'source-client')
    const plugin = loadPlugin(root, probe.dir)
    const linked = ensureRuntimePackageLink(plugin, join(root, 'probe-home'), 'web')
    assert.equal(realpathSync(join(probe.dir, 'src/client.js')), realpathSync(join(pluginDir, 'src/client.js')))
    assert.equal(linked?.entry, realpathSync(join(probe.dir, 'src/probe.ts')))
  })
})
