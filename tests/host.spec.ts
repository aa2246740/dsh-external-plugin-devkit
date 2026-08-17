import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { startHost, writeHostState } from '../src/internal/host.ts'

describe('startHost', () => {
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
})
