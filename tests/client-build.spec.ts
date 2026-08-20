import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
})
