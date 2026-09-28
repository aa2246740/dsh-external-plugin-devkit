import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { armGuardian, readGuardianControl, runGuardianCycle } from '../src/internal/guardian.ts'
import { writeHostState } from '../src/internal/host.ts'
import { readCreatorContext } from '../src/internal/creator.ts'

test('Desktop Guardian never signals or replaces an unhealthy Electron Host', async t => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-guardian-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const host = { pid: process.pid, launcherPid: process.ppid, profile: 'desktop' as const, port: 19387, ownership: 'adopted' as const, overlay: '', logFile: '', command: [], startedAt: new Date(0).toISOString() }
  writeHostState(root, host); armGuardian(root, host)
  assert.equal(readGuardianControl(root).desired?.profile, 'desktop')
  const result = await runGuardianCycle(root, { pidAlive: () => true, portOpen: async () => false,
    stopHost: async () => { throw new Error('must not stop desktop') },
    startHost: () => { throw new Error('must not start desktop') } })
  assert.equal(result.action, 'fused'); assert.equal(readGuardianControl(root).enabled, false)
})

test('Desktop bridge context requires complete application identity', () => {
  const value = { sessionId: 's', hostPid: 1, hostParentPid: 2, hostPort: 19387, bridgeVersion: 2, hostProfile: 'desktop' }
  assert.throws(() => readCreatorContext({ DSHX_CREATOR_CONTEXT: JSON.stringify(value) }), /hostRoot/)
  const parsed = readCreatorContext({ DSHX_CREATOR_CONTEXT: JSON.stringify({ ...value, hostRoot: '/app/runtime', hostHome: '/user/home' }) })
  assert.equal(parsed?.hostProfile, 'desktop'); assert.equal(parsed?.hostRoot, '/app/runtime')
})
