import assert from 'node:assert/strict'
import { test } from 'node:test'
import { restartHandoff, identityOnlyHandoff } from '../src/internal/delivery-handoff.ts'

const host = { pid: 123, port: 43127, profile: 'web' as const, ownership: 'adopted' as const, launcherPid: 120, processStartedAt: 'birth', home: '/example/home', hostRoot: '/example/runtime', command: [], overlay: '', logFile: '', startedAt: '' }
test('App handoff targets its launcher, never restart-supervised', () => {
 const result = restartHandoff(host, '/Applications/DSH.app/Contents/MacOS/DSH')
 assert.equal(result.launcher, 'app')
 assert.equal(result.appPath, '/Applications/DSH.app')
 assert.equal(result.status, 'AWAITING_LAUNCHER_RESTART')
 assert.doesNotMatch(result.instructions.join(' '), /run.*restart-supervised/)
})
test('direct web uses the original terminal and preserves Home and port', () => {
 const result = restartHandoff({ ...host, port: 3080 }, '/bin/zsh')
 assert.equal(result.launcher, 'cli')
 assert.equal(result.port, 3080)
 assert.match(result.instructions.join(' '), /original terminal/)
})
test('unknown ownership or missing process evidence cannot authorize restart', () => {
 assert.equal(restartHandoff(undefined).status, 'TARGET_UNPROVEN')
 assert.equal(restartHandoff(host).launcher, 'unknown')
})
test('undecided and inventory handoffs retain identity without restart instructions', () => {
 for (const executable of ['/Applications/DSH.app/Contents/MacOS/DSH', '/bin/zsh']) {
  const handoff = identityOnlyHandoff(restartHandoff(host, executable))
  assert.equal(handoff.status, 'TARGET_IDENTIFIED')
  assert.equal(handoff.pid, 123)
  assert.equal(handoff.port, 43127)
  assert.doesNotMatch(handoff.instructions.join(' '), /quit|reopen|stop dsh|restart-supervised/)
  assert.match(handoff.instructions.join(' '), /does not authorize a restart/)
 }
 assert.equal(identityOnlyHandoff(restartHandoff(undefined)).status, 'TARGET_UNPROVEN')
})
