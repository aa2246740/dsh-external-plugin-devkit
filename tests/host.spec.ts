import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { cmdRestart, cmdVerify } from '../src/commands/host.ts'
import { dshHostArgs, pidAlive, startHost, writeHostState } from '../src/internal/host.ts'
import { parseCli, writeText } from '../src/internal/io.ts'

async function silence<T>(run: () => Promise<T>): Promise<T> {
  const write = process.stdout.write.bind(process.stdout)
  process.stdout.write = (() => true) as typeof process.stdout.write
  try {
    return await run()
  } finally {
    process.stdout.write = write
  }
}

describe('startHost', () => {
  it('suppresses RC8 automatic browser opening for supervised Web hosts', () => {
    assert.deepEqual(dshHostArgs({ profile: 'web', port: 3091 }), [
      'web',
      '--no-open',
      '--port',
      '3091',
    ])
    assert.deepEqual(dshHostArgs({ profile: 'web', port: 3091, overlay: '/tmp/demo.patch.yml' }), [
      'web',
      '--patch',
      '/tmp/demo.patch.yml',
      '--no-open',
      '--port',
      '3091',
    ])
  })

  it('refuses a second supervised host', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-host-'))
    writeHostState(root, {
      pid: process.pid,
      profile: 'web',
      port: 3091,
      overlay: '',
      logFile: join(root, '.dshx/logs/web.log'),
      startedAt: new Date().toISOString(),
      command: ['node'],
    })
    assert.throws(
      () => startHost(root, { profile: 'web', port: 3092 }),
      /already supervises/,
    )
  })

  it('verify-boot refuses an active supervised host without stopping it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-host-'))
    writeText(join(root, 'my-plugins/demo/dshx.yml'), 'id: demo\nentry: src/demo.ts\nmarker: "[demo] loaded"\nkind: function\n')
    writeText(join(root, 'my-plugins/demo/src/demo.ts'), `export function apply() { console.log('[demo] loaded') }\n`)
    writeHostState(root, {
      pid: process.pid,
      profile: 'web',
      port: 3091,
      overlay: '',
      logFile: join(root, '.dshx/logs/web.log'),
      startedAt: new Date().toISOString(),
      command: ['node'],
    })
    const { options } = parseCli(['verify-boot', 'demo', '--json'])
    const code = await silence(() => cmdVerify(['demo'], options, root))
    assert.equal(code, 1)
    assert.equal(pidAlive(process.pid), true)
  })

  it('restart-supervised does not resurrect stale last-host state', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-host-'))
    writeText(join(root, '.dshx/last-host.json'), `${JSON.stringify({
      profile: 'web',
      port: 3091,
      plugin: 'old-plugin',
      logFile: join(root, '.dshx/logs/web.log'),
    })}\n`)
    const { options } = parseCli(['restart-supervised', '--json'])
    const code = await silence(() => cmdRestart([], options, root))
    assert.equal(code, 1)
  })
})
