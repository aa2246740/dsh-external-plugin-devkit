import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { cmdRestart, cmdStop, cmdVerify } from '../src/commands/host.ts'
import { dshHostArgs, pidAlive, probePid, probePort, startHost, writeHostState } from '../src/internal/host.ts'
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

  it('verify-boot rejects a persistent second Host', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-host-'))
    const { options } = parseCli(['verify-boot', 'demo', '--keep', '--json'])
    const code = await silence(() => cmdVerify(['demo'], options, root))
    assert.equal(code, 1)
    assert.equal(pidAlive(process.pid), true)
  })

  it('does not interpret EPERM as a dead process or closed port', async () => {
    const denied = Object.assign(new Error('denied'), { code: 'EPERM' })
    const signal = (() => { throw denied }) as typeof process.kill
    assert.equal(probePid(123, signal), 'unknown')
    const request = (async () => { throw Object.assign(new Error('denied'), { cause: denied }) }) as typeof fetch
    assert.equal(await probePort(43127, '127.0.0.1', request), 'unknown')
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

  it('manual stop and restart refuse a live Host adopted from the official launcher', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-host-'))
    writeHostState(root, {
      pid: process.pid,
      profile: 'web',
      port: 43127,
      overlay: '',
      logFile: join(root, '.dshx/logs/web.log'),
      startedAt: new Date().toISOString(),
      command: [],
      ownership: 'adopted',
    })
    const stop = parseCli(['stop', '--json']).options
    const restart = parseCli(['restart-supervised', '--json']).options
    assert.equal(await silence(() => cmdStop([], stop, root)), 1)
    assert.equal(await silence(() => cmdRestart([], restart, root)), 1)
    assert.equal(pidAlive(process.pid), true)
  })
})
