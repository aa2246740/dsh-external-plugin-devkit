import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, it } from 'node:test'
import { externalClientBundle } from '../src/client-build.js'
import { writeText } from '../src/internal/io.ts'

function packageRoot(manifest: object): string {
  const root = mkdtempSync(join(tmpdir(), 'dshx-client-build-'))
  writeText(join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return root
}

describe('externalClientBundle', () => {
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
    assert.throws(
      () => client.plugins[0].resolveId('@deepseek-ai/dsh-unapproved-runtime'),
      /not a shared baseline or dsh\.client\.external request/,
    )
  })

  it('uses the target Harness platform table when dshx is symlinked from another checkout', () => {
    const harness = mkdtempSync(join(tmpdir(), 'dshx-target-platform-'))
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
