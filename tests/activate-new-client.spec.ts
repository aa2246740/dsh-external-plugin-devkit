import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { activateNewClient, parseBootManifest, planWatchedPatch } from '../src/internal/new-client.ts'

const temporaryRoots: string[] = []

function temporaryDirectory(label: string): string {
  const path = mkdtempSync(join(tmpdir(), label))
  temporaryRoots.push(path)
  return path
}

function fixture(): { root: string; home: string; pluginDir: string; profileDir: string; patchPath: string } {
  const root = temporaryDirectory('dshx-new-client-root-')
  const home = temporaryDirectory('dshx-new-client-home-')
  const pluginDir = join(root, 'my-plugins/demo')
  const profileDir = join(home, 'profiles/web')
  const patchPath = join(profileDir, 'cordis.patch.yml')
  mkdirSync(join(pluginDir, 'src'), { recursive: true })
  mkdirSync(join(pluginDir, 'lib'), { recursive: true })
  mkdirSync(join(profileDir, 'node_modules'), { recursive: true })
  writeFileSync(join(pluginDir, 'dshx.yml'), 'id: demo\nentry: src/demo.ts\nmarker: "[demo] loaded"\nkind: client\nprofile: web\n')
  writeFileSync(join(pluginDir, 'src/demo.ts'), "export function apply() { console.log('[demo] loaded') }\n")
  writeFileSync(join(pluginDir, 'lib/client.js'), "window.__ModuleLoader__.load({ id: 'demo', factory: function () {} })\n")
  writeFileSync(join(pluginDir, 'package.json'), JSON.stringify({
    name: 'demo',
    version: '0.0.0',
    type: 'module',
    exports: { './client': './lib/client.js' },
    dsh: { client: { platform: 'web', inject: [] } },
  }, null, 2))
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dsh: { profile: { bundles: [] } },
    dependencies: {},
  }, null, 2))
  return { root, home, pluginDir, profileDir, patchPath }
}

function installFixtureLink(pluginDir: string, profileDir: string): void {
  const manifestPath = join(profileDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.dependencies.demo = `link:${pluginDir}`
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  symlinkSync(pluginDir, join(profileDir, 'node_modules/demo'), 'dir')
}

afterEach(() => {
  for (const path of temporaryRoots.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('activate-new-client', () => {
  it('parses both RC8 window and RC2 globalThis boot manifest injections', () => {
    const entries = [{ id: 'demo', url: '/plugins/demo/client.js?rev=abc' }]
    const rc8 = `<html><script>window.__DSH_BOOT__ = ${JSON.stringify({ entries })};</script></html>`
    const rc2 = '<html><script>globalThis["__DSH_BOOT__"] = {"entries":[{"id":"demo","url":"/plugins/demo/client.js?rev=abc","rev":"\\u003c/script>"}]}</script></html>'

    assert.deepEqual(parseBootManifest(rc8).entries, entries)
    assert.deepEqual(parseBootManifest(rc2).entries, [{
      id: 'demo',
      url: '/plugins/demo/client.js?rev=abc',
      rev: '</script>',
    }])
  })

  it('fails closed when the Host has no supported boot manifest assignment', () => {
    assert.throws(
      () => parseBootManifest('<script>const __DSH_BOOT__ = {}</script>'),
      /no supported __DSH_BOOT__ manifest assignment/,
    )
  })

  it('installs the link before touching the watched patch, then proves the Host manifest', async () => {
    const { root, home, pluginDir, profileDir, patchPath } = fixture()
    const events: string[] = []
    const result = await activateNewClient(root, 'web', 'demo', 43127, 2_000, {
      dshHome: home,
      installLink() {
        events.push('install')
        installFixtureLink(pluginDir, profileDir)
        return { code: 0, stdout: '', stderr: '' }
      },
      async verifyHost({ id }) {
        events.push('verify')
        assert.equal(existsSync(join(profileDir, 'node_modules/demo/package.json')), true)
        assert.match(readFileSync(patchPath, 'utf8'), /id: "demo"/)
        return { id, manifestUrl: 'http://127.0.0.1:43127/', clientUrl: 'http://127.0.0.1:43127/plugins/demo/client.js?rev=abc' }
      },
    })

    assert.deepEqual(events, ['install', 'verify'])
    assert.equal(result.linkAction, 'installed')
    assert.equal(result.patchAction, 'inserted')
    assert.equal(result.hostEntry.id, 'demo')
  })

  it('re-triggers an existing matching row only after repairing a missing profile link', async () => {
    const { root, home, pluginDir, profileDir, patchPath } = fixture()
    const original = '# keep me\n- insert:\n    - id: demo\n      name: demo\n'
    writeFileSync(patchPath, original)
    const result = await activateNewClient(root, 'web', 'demo', 43127, 2_000, {
      dshHome: home,
      installLink() {
        installFixtureLink(pluginDir, profileDir)
        return { code: 0, stdout: '', stderr: '' }
      },
      async settleWatchedPatch() {
        assert.match(readFileSync(patchPath, 'utf8'), /id: "demo"\n  disabled: true/)
      },
      async verifyHost({ id }) {
        assert.equal(readFileSync(patchPath, 'utf8'), original)
        return { id, manifestUrl: 'http://127.0.0.1:43127/', clientUrl: 'http://127.0.0.1:43127/plugins/demo/client.js' }
      },
    })
    assert.equal(result.patchAction, 'retriggered')
  })

  it('preserves comments and !!js while appending one stable row', () => {
    const current = '# custom\n- id: web-server\n  config:\n    port: !!js ctx.webStartup.port ?? 3080\n'
    const planned = planWatchedPatch(current, 'demo', 'demo')
    assert.equal(planned.action, 'inserted')
    assert.match(planned.after, /!!js ctx\.webStartup\.port \?\? 3080/)
    assert.match(planned.after, /id: "demo"/)
  })

  it('fails closed on an id collision before installing anything', async () => {
    const { root, home, profileDir, patchPath } = fixture()
    writeFileSync(patchPath, '- insert:\n    - id: demo\n      name: another-package\n')
    let installed = false
    await assert.rejects(
      activateNewClient(root, 'web', 'demo', 43127, 2_000, {
        dshHome: home,
        installLink() {
          installed = true
          return { code: 0, stdout: '', stderr: '' }
        },
      }),
      /already belongs to another-package/,
    )
    assert.equal(installed, false)
    assert.match(readFileSync(join(profileDir, 'package.json'), 'utf8'), /"dependencies": \{\}/)
  })

  it('rolls back a newly inserted patch row when the live Host cannot be proved', async () => {
    const { root, home, pluginDir, profileDir, patchPath } = fixture()
    await assert.rejects(
      activateNewClient(root, 'web', 'demo', 43127, 2_000, {
        dshHome: home,
        installLink() {
          installFixtureLink(pluginDir, profileDir)
          return { code: 0, stdout: '', stderr: '' }
        },
        async verifyHost() { throw new Error('manifest missing') },
      }),
      /manifest missing.*rolled back/,
    )
    assert.equal(existsSync(patchPath), false)
  })

  it('hands a pre-install resolution scar to the external supervisor instead of retrying forever', async () => {
    const { root, home, pluginDir, profileDir, patchPath } = fixture()
    installFixtureLink(pluginDir, profileDir)
    const original = '- insert:\n    - id: demo\n      name: demo\n'
    writeFileSync(patchPath, original)
    await assert.rejects(
      activateNewClient(root, 'web', 'demo', 43127, 2_000, {
        dshHome: home,
        async settleWatchedPatch() {},
        async verifyHost() { throw new Error('manifest missing') },
      }),
      /pre-install resolution failure.*external supervisor/,
    )
    assert.equal(readFileSync(patchPath, 'utf8'), original)
  })
})
