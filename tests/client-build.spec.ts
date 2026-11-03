import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { before, describe, it } from 'node:test'
import { writeText } from '../src/internal/io.ts'

function packageRoot(manifest: object): string {
  const root = mkdtempSync(join(tmpdir(), 'dshx-client-build-'))
  writeText(join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return root
}

function harnessRoot(): string {
  const harness = mkdtempSync(join(tmpdir(), 'dshx-platform-table-'))
  // Official checkouts are `"type": "module"`. Without it, Node 22.22
  // require()s the platform table while the ESM import is in flight.
  writeFileSync(join(harness, 'package.json'), '{"type":"module"}\n')
  const platform = join(harness, 'packages/client/web/src/platform.ts')
  mkdirSync(dirname(platform), { recursive: true })
  writeFileSync(platform, [
    "export const PLATFORM_MODULES = ['react', '@deepseek-ai/dsh-client-store'] as const",
    "export const PRELOADED_CLIENT_EXTERNALS = ['react/jsx-runtime'] as const",
    '',
  ].join('\n'))
  return harness
}

describe('externalClientBundle', () => {
  // client-build.js resolves the Harness platform table at module load, so it
  // must be imported only after the spec's fabricated harness is in place;
  // otherwise a plain `npm test` without DSHX_HARNESS fails on import alone.
  interface BundleConfig {
    name: string
    define?: Record<string, string>
    deps: { neverBundle(specifier: string): boolean; alwaysBundle(specifier: string): boolean }
    plugins: Array<{
      name: string
      resolveId(source: string, importer?: string): unknown
      load?(this: { addWatchFile(id: string): void }, id: string): Promise<string | null>
    }>
    outputOptions: { banner: string }
  }
  let externalClientBundle: (id: string, libEntry: string[], options?: { packageRoot?: string; clientEntry?: string }) => [BundleConfig, BundleConfig]
  before(async () => {
    process.env.DSHX_HARNESS ??= harnessRoot()
    // @ts-expect-error client-build.js ships no type declarations
    ;({ externalClientBundle } = await import('../src/client-build.js'))
  })
  it('builds an out-of-tree package without workspace manifest discovery', () => {
    const root = packageRoot({
      name: 'external-demo',
      dependencies: { zod: '^4.0.0' },
      dsh: { client: { platform: 'web', external: ['demo-provider/client'] } },
    })
    const [host, client] = externalClientBundle('external-demo', ['lib/types/index.js'], { packageRoot: root })
    assert.equal(host.name, 'external-demo')
    assert.equal(client.name, 'external-demo/client')
    assert.equal(host.deps.neverBundle('zod'), true)
    assert.equal(host.deps.alwaysBundle('node:fs'), false)
    assert.equal(client.deps.neverBundle('react'), true)
    assert.equal(client.deps.neverBundle('demo-provider/client'), true)
    assert.equal(client.deps.alwaysBundle('clsx'), true)
    assert.match(client.outputOptions.banner, /id: "external-demo"/)
  })

  it('fixes DSH_CLIENT_* values into both Host and browser defines without clobbering Host process.env', () => {
    const previous = process.env.DSH_CLIENT_APP_TITLE
    process.env.DSH_CLIENT_APP_TITLE = 'Fixed Title'
    try {
      const root = packageRoot({
        name: 'external-demo',
        dsh: { client: { platform: 'web' } },
      })
      const [host, client] = externalClientBundle('external-demo', ['lib/types/index.js'], { packageRoot: root })
      assert.equal(host.define?.['process.env.DSH_CLIENT_APP_TITLE'], JSON.stringify('Fixed Title'))
      assert.equal(client.define?.['process.env.DSH_CLIENT_APP_TITLE'], JSON.stringify('Fixed Title'))
      assert.equal(host.define?.['process.env'], undefined)
      assert.equal(client.define?.['process.env'], '{}')
    } finally {
      if (previous === undefined) delete process.env.DSH_CLIENT_APP_TITLE
      else process.env.DSH_CLIENT_APP_TITLE = previous
    }
  })

  it('inlines .svg, .png, and .webp imports as watched base64 data URLs with lib/types fallback', async () => {
    const root = packageRoot({
      name: 'external-demo',
      dsh: { client: { platform: 'web' } },
    })
    const svgPath = join(root, 'src/client/icon.svg')
    const pngPath = join(root, 'src/client/pixel.png')
    const webpPath = join(root, 'src/client/badge.webp')
    writeText(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>')
    mkdirSync(dirname(pngPath), { recursive: true })
    writeFileSync(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    writeFileSync(webpPath, Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'binary'))
    const [, client] = externalClientBundle('external-demo', ['lib/types/index.js'], { packageRoot: root })
    const imagePlugin = client.plugins.find(plugin => plugin.name === 'dshx-image-inline')
    assert.ok(imagePlugin)
    const importerFromTypes = join(root, 'lib/types/client/index.js')
    assert.equal(imagePlugin.resolveId('./icon.svg', importerFromTypes), svgPath)
    assert.equal(imagePlugin.resolveId('./pixel.png', importerFromTypes), pngPath)
    assert.equal(imagePlugin.resolveId('./badge.webp', importerFromTypes), webpPath)
    assert.equal(imagePlugin.resolveId('./other.txt', importerFromTypes), null)
    const watched: string[] = []
    const ctx = { addWatchFile(id: string) { watched.push(id) } }
    const svgModule = await imagePlugin.load!.call(ctx, svgPath)
    const pngModule = await imagePlugin.load!.call(ctx, pngPath)
    const webpModule = await imagePlugin.load!.call(ctx, webpPath)
    assert.match(svgModule ?? '', /^export default "data:image\/svg\+xml;base64,/)
    assert.match(pngModule ?? '', /^export default "data:image\/png;base64,/)
    assert.match(webpModule ?? '', /^export default "data:image\/webp;base64,/)
    assert.deepEqual(watched, [svgPath, pngPath, webpPath])
  })

  it('fails closed on an id mismatch or an invalid module-table request', () => {
    const mismatch = packageRoot({ name: 'manifest-name', dsh: { client: { platform: 'web' } } })
    assert.throws(
      () => externalClientBundle('config-name', ['lib/types/index.js'], { packageRoot: mismatch }),
      /does not match package name/,
    )

    const baseline = packageRoot({
      name: 'external-demo',
      dsh: { client: { platform: 'web', external: ['react'] } },
    })
    assert.throws(
      () => externalClientBundle('external-demo', ['lib/types/index.js'], { packageRoot: baseline }),
      /repeats implicit baseline module/,
    )
  })

  it('fails before bundling when the client reads an undeclared Cordis service', () => {
    const root = packageRoot({ name: 'external-demo', dsh: { client: { platform: 'web' } } })
    writeText(join(root, 'src/client/index.tsx'), `export const inject = ['slots']
export function apply(ctx) { ctx.locale.register('demo', { en: {} }) }
`)
    assert.throws(
      () => externalClientBundle('external-demo', ['lib/types/index.js'], {
        packageRoot: root,
        clientEntry: 'src/client/index.tsx',
      }),
      /entry-level export const inject.*package\.json dsh\.client\.inject/u,
    )
  })

  it('bundles the official browser-safe Workspace path helper instead of requesting a Loader module row', () => {
    const root = packageRoot({
      name: 'external-demo',
      peerDependencies: { '@deepseek-ai/dsh-util-workspace-path': '^0.1.2-rc.1' },
      dsh: { client: { platform: 'web' } },
    })
    const [, client] = externalClientBundle('external-demo', ['lib/types/index.js'], { packageRoot: root })
    assert.equal(client.deps.neverBundle('@deepseek-ai/dsh-util-workspace-path'), false)
    assert.equal(client.deps.alwaysBundle('@deepseek-ai/dsh-util-workspace-path'), true)
    assert.equal(client.plugins[0].resolveId('@deepseek-ai/dsh-util-workspace-path'), null)
    assert.equal(client.plugins[0].resolveId('@deepseek-ai/dsh-plugin-manager/registry'), null)
    assert.equal(client.plugins[0].resolveId('@deepseek-ai/dsh-agent-preset-registry/display'), null)
    assert.equal(client.plugins[0].resolveId('@deepseek-ai/dsh-api-workspace-controller/default-workspace'), null)
    assert.equal(client.plugins[0].resolveId('@deepseek-ai/dsh-native-command/types'), null)
    assert.throws(
      () => client.plugins[0].resolveId('@deepseek-ai/dsh-api-workspace-controller'),
      /not a shared baseline or dsh\.client\.external request/,
    )
    assert.throws(
      () => client.plugins[0].resolveId('@deepseek-ai/dsh-agent-presets/display'),
      /not a shared baseline or dsh\.client\.external request/,
    )
    assert.throws(
      () => client.plugins[0].resolveId('@deepseek-ai/dsh-unapproved-runtime'),
      /not a shared baseline or dsh\.client\.external request/,
    )
  })

  it('uses the target Harness platform table when dshx is symlinked from another checkout', () => {
    const harness = mkdtempSync(join(tmpdir(), 'dshx-target-platform-'))
    writeFileSync(join(harness, 'package.json'), '{"type":"module"}\n')
    const platform = join(harness, 'packages/client/web/src/platform.ts')
    mkdirSync(dirname(platform), { recursive: true })
    writeFileSync(platform, [
      "export const PLATFORM_MODULES = ['react', '@deepseek-ai/dsh-client-store'] as const",
      "export const PRELOADED_CLIENT_EXTERNALS = ['react/jsx-runtime'] as const",
      '',
    ].join('\n'))
    const plugin = packageRoot({
      name: 'external-demo',
      dsh: { client: { platform: 'web' } },
    })
    const adapter = pathToFileURL(join(process.cwd(), 'src/client-build.js')).href
    const script = [
      `const { externalClientBundle } = await import(${JSON.stringify(adapter)})`,
      `const configs = externalClientBundle('external-demo', ['lib/types/index.js'], { packageRoot: ${JSON.stringify(plugin)} })`,
      "process.stdout.write(String(configs[1].deps.neverBundle('@deepseek-ai/dsh-client-store')))",
    ].join('\n')
    const output = execFileSync(process.execPath, ['--import', 'tsx/esm', '--input-type=module', '--eval', script], {
      cwd: process.cwd(),
      env: { ...process.env, DSHX_HARNESS: harness },
      encoding: 'utf8',
    })
    assert.equal(output, 'true')
  })
})
