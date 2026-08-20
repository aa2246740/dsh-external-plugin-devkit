import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  acknowledgeCreatorIncident,
  applyCreatorQuarantine,
  beginCreatorActivation,
  claimCreatorPlugin,
  finishCreatorActivation,
  listCreatorClaims,
  markCreatorActivationRunning,
  pendingCreatorIncidents,
  readActiveCreatorTransaction,
  recordCreatorIncident,
  type CreatorClientFailureReport,
  type CreatorContext,
} from '../src/internal/creator.ts'
import {
  adoptOrArmCreatorHost,
  armGuardian,
  readGuardianControl,
  recoverCreatorClientFailure,
  runGuardianCycle,
  type GuardianRuntimeState,
} from '../src/internal/guardian.ts'
import { readHostState, writeHostState } from '../src/internal/host.ts'
import type { HostState } from '../src/internal/types.ts'

const roots: string[] = []

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'dshx-creator-guardian-'))
  roots.push(value)
  return value
}

function context(sessionId: string, callId = `call-${sessionId}`): CreatorContext {
  return {
    sessionId,
    callId,
    rootCallId: `root-${sessionId}`,
    hostPid: process.pid,
    hostParentPid: process.ppid,
    hostPort: 43127,
    bridgeVersion: 2,
  }
}

function deadHost(pid = 987_654): HostState {
  return {
    pid,
    profile: 'web',
    port: 43127,
    overlay: '',
    logFile: '/missing/host.log',
    startedAt: new Date(0).toISOString(),
    command: [],
    ownership: 'adopted',
  }
}

afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('Creator+ claims and transactions', () => {
  it('allows any number of sessions on different plugins and rejects two owners for one plugin', () => {
    const harness = root()
    claimCreatorPlugin(harness, 'plugin-a', context('session-a'), 1_000)
    claimCreatorPlugin(harness, 'plugin-b', context('session-b'), 1_000)
    assert.deepEqual(listCreatorClaims(harness, 1_001).map(item => [item.pluginId, item.sessionId]), [
      ['plugin-a', 'session-a'],
      ['plugin-b', 'session-b'],
    ])
    assert.throws(
      () => claimCreatorPlugin(harness, 'plugin-a', context('session-b'), 1_001),
      /already claimed by Creator\+ session session-a/,
    )
  })

  it('serializes only the live activation section', () => {
    const harness = root()
    const patch = join(harness, 'profile/cordis.patch.yml')
    mkdirSync(join(harness, 'profile'), { recursive: true })
    claimCreatorPlugin(harness, 'plugin-a', context('session-a'))
    claimCreatorPlugin(harness, 'plugin-b', context('session-b'))
    const first = beginCreatorActivation(harness, 'plugin-a', patch, 43127, context('session-a'))
    assert.throws(
      () => beginCreatorActivation(harness, 'plugin-b', patch, 43127, context('session-b')),
      /global lock for plugin-a/,
    )
    first.release()
    const second = beginCreatorActivation(harness, 'plugin-b', patch, 43127, context('session-b'))
    second.release()
  })

  it('quarantines an existing watched row without destroying its exact preimage', () => {
    const harness = root()
    const patch = join(harness, 'profile/cordis.patch.yml')
    mkdirSync(join(harness, 'profile'), { recursive: true })
    const before = '# user comment\n- insert:\n    - id: plugin-a\n      name: plugin-a\n'
    writeFileSync(patch, before)
    claimCreatorPlugin(harness, 'plugin-a', context('session-a'))
    const handle = beginCreatorActivation(harness, 'plugin-a', patch, 43127, context('session-a'))
    const transaction = markCreatorActivationRunning(harness, handle.transaction)
    const quarantine = applyCreatorQuarantine(harness, transaction)
    handle.release()

    assert.equal(quarantine.mode, 'disabled')
    assert.match(readFileSync(patch, 'utf8'), /# user comment/)
    assert.match(readFileSync(patch, 'utf8'), /- id: "plugin-a"\n  disabled: true/)
    assert.equal(transaction.patch.text, before)
  })

  it('quarantines and retries one inserted plugin without overwriting another session patch change', () => {
    const harness = root()
    const patch = join(harness, 'profile/cordis.patch.yml')
    mkdirSync(join(harness, 'profile'), { recursive: true })
    writeFileSync(patch, '[]\n')
    claimCreatorPlugin(harness, 'plugin-a', context('session-a'))
    const first = beginCreatorActivation(harness, 'plugin-a', patch, 43127, context('session-a'))
    const transaction = markCreatorActivationRunning(harness, first.transaction)
    writeFileSync(patch, `${transaction.patch.afterText}- insert:\n    - id: plugin-b\n      name: plugin-b\n`)
    const quarantine = applyCreatorQuarantine(harness, transaction)
    first.release()

    assert.equal(quarantine.mode, 'disabled')
    assert.match(readFileSync(patch, 'utf8'), /id: plugin-b/)
    assert.match(readFileSync(patch, 'utf8'), new RegExp(`quarantine ${transaction.id}`))

    const retry = beginCreatorActivation(harness, 'plugin-a', patch, 43127, context('session-a'))
    const restored = readFileSync(patch, 'utf8')
    retry.release()
    assert.match(restored, /id: "?plugin-a"?/)
    assert.match(restored, /id: plugin-b/)
    assert.doesNotMatch(restored, /dshx Creator\+ quarantine/)
  })

  it('delivers and acknowledges recovery incidents only to their owning session', () => {
    const harness = root()
    const incident = recordCreatorIncident(harness, {
      reason: 'host-exited',
      confidence: 'high',
      sessionIds: ['session-a'],
      pluginId: 'plugin-a',
      summary: 'recovered',
      rollback: 'disabled',
    })
    assert.equal(pendingCreatorIncidents(harness, 'session-a').length, 1)
    assert.equal(pendingCreatorIncidents(harness, 'session-b').length, 0)
    assert.equal(acknowledgeCreatorIncident(harness, 'session-a', incident.id), true)
    assert.equal(pendingCreatorIncidents(harness, 'session-a').length, 0)
  })
})

describe('Creator+ Guardian', () => {
  it('quarantines an exact browser-loader failure and steers only its owning session', async () => {
    const harness = root()
    const now = Date.now()
    const patch = join(harness, 'profile/cordis.patch.yml')
    mkdirSync(join(harness, 'profile'), { recursive: true })
    writeFileSync(patch, '- insert:\n    - id: plugin-a\n      name: plugin-a\n')
    claimCreatorPlugin(harness, 'plugin-a', context('session-a'), now)
    const handle = beginCreatorActivation(harness, 'plugin-a', patch, 43127, context('session-a'), now + 1)
    const running = markCreatorActivationRunning(harness, handle.transaction, now + 2)
    finishCreatorActivation(harness, running, { ok: true, hostAlive: true }, now + 3)
    handle.release()
    writeHostState(harness, {
      ...deadHost(process.pid),
      startedAt: new Date(now).toISOString(),
      launcherPid: process.ppid,
    })
    const failure: CreatorClientFailureReport = {
      failedIds: ['plugin-a'],
      message: 'cannot get property "locale" without inject',
      hostPid: process.pid,
      hostParentPid: process.ppid,
      hostPort: 43127,
    }
    const recovered = await recoverCreatorClientFailure(harness, failure, {
      now: () => now + 10,
      waitForClientAbsent: async () => true,
    })
    assert.equal(recovered.reload, true)
    assert.equal(recovered.incident.pluginId, 'plugin-a')
    assert.equal(recovered.incident.confidence, 'probable')
    assert.deepEqual(recovered.incident.sessionIds, ['session-a'])
    assert.match(readFileSync(patch, 'utf8'), /disabled: true/)
    assert.equal(pendingCreatorIncidents(harness, 'session-a').length, 1)
  })

  it('does not mutate the patch for an unknown or stale browser report', async () => {
    const harness = root()
    const patch = join(harness, 'profile/cordis.patch.yml')
    mkdirSync(join(harness, 'profile'), { recursive: true })
    const before = '- insert:\n    - id: plugin-a\n      name: plugin-a\n'
    writeFileSync(patch, before)
    claimCreatorPlugin(harness, 'plugin-a', context('session-a'))
    writeHostState(harness, deadHost(process.pid))
    const recovered = await recoverCreatorClientFailure(harness, {
      failedIds: ['unknown-plugin'],
      message: 'failed',
      hostPid: process.pid + 1,
      hostParentPid: process.ppid,
      hostPort: 43127,
    }, { waitForClientAbsent: async () => true })
    assert.equal(recovered.reload, false)
    assert.equal(recovered.incident.confidence, 'ambiguous')
    assert.equal(recovered.incident.rollback, 'none')
    assert.equal(readFileSync(patch, 'utf8'), before)
  })

  it('adopts an official Web Host and starts an external Guardian without changing DSH core', async () => {
    const harness = root()
    const guardian: GuardianRuntimeState = {
      pid: 123,
      version: '0.6.0',
      startedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
    }
    const result = await adoptOrArmCreatorHost(harness, context('session-a'), {
      portOpen: async () => true,
      ensureGuardian: async () => guardian,
    })
    assert.equal(result.adopted, true)
    assert.equal(result.host.pid, process.pid)
    assert.equal(readHostState(harness)?.ownership, 'adopted')
    assert.equal(readGuardianControl(harness).enabled, true)
  })

  it('attributes a dead Host to the active transaction, quarantines it, restarts once, and records steering evidence', async () => {
    const harness = root()
    const patch = join(harness, 'profile/cordis.patch.yml')
    mkdirSync(join(harness, 'profile'), { recursive: true })
    writeFileSync(patch, '- insert:\n    - id: plugin-a\n      name: plugin-a\n')
    claimCreatorPlugin(harness, 'plugin-a', context('session-a'))
    const handle = beginCreatorActivation(harness, 'plugin-a', patch, 43127, context('session-a'))
    markCreatorActivationRunning(harness, handle.transaction)
    handle.release()
    const previous = deadHost()
    writeHostState(harness, previous)
    armGuardian(harness, previous, 10_000)

    const result = await runGuardianCycle(harness, {
      now: () => 11_000,
      pidAlive: () => false,
      portOpen: async () => false,
      startHost: (_root, spec) => ({ ...deadHost(222), port: spec.port, ownership: 'spawned' }),
      waitForHttp: async () => true,
      readLogTail: () => 'failed to apply loader entry plugin-a (plugin-a)',
    })

    assert.equal(result.action, 'restarted')
    assert.equal(result.incident?.confidence, 'high')
    assert.deepEqual(result.incident?.sessionIds, ['session-a'])
    assert.equal(result.incident?.pluginId, 'plugin-a')
    assert.equal(result.incident?.recoveredPid, 222)
    assert.equal(readActiveCreatorTransaction(harness), undefined)
    assert.match(readFileSync(patch, 'utf8'), /disabled: true/)
    assert.equal(pendingCreatorIncidents(harness, 'session-a').length, 1)
  })

  it('quarantines the culprit without opening a duplicate listener when the App shell already recovered the port', async () => {
    const harness = root()
    const patch = join(harness, 'profile/cordis.patch.yml')
    mkdirSync(join(harness, 'profile'), { recursive: true })
    writeFileSync(patch, '- insert:\n    - id: plugin-a\n      name: plugin-a\n')
    claimCreatorPlugin(harness, 'plugin-a', context('session-a'))
    const handle = beginCreatorActivation(harness, 'plugin-a', patch, 43127, context('session-a'))
    markCreatorActivationRunning(harness, handle.transaction)
    handle.release()
    const launcherPid = 123_456
    const previous = { ...deadHost(), launcherPid }
    writeHostState(harness, previous)
    armGuardian(harness, previous)

    const result = await runGuardianCycle(harness, {
      pidAlive: pid => pid === launcherPid,
      portOpen: async () => false,
      waitForExternalRecovery: async () => true,
      startHost: () => { throw new Error('must not open a duplicate listener') },
    })
    assert.equal(result.action, 'recovered-elsewhere')
    assert.equal(result.incident?.confidence, 'high')
    assert.equal(result.incident?.pluginId, 'plugin-a')
    assert.equal(result.incident?.rollback, 'disabled')
    assert.match(readFileSync(patch, 'utf8'), /disabled: true/)
    assert.equal(readGuardianControl(harness).enabled, false)
  })

  it('attributes a delayed crash to the latest settled transaction without blaming an already recovered one', async () => {
    const harness = root()
    const base = Date.now()
    const patch = join(harness, 'profile/cordis.patch.yml')
    mkdirSync(join(harness, 'profile'), { recursive: true })
    writeFileSync(patch, '- insert:\n    - id: plugin-a\n      name: plugin-a\n')
    claimCreatorPlugin(harness, 'plugin-a', context('session-a'), base)
    const handle = beginCreatorActivation(harness, 'plugin-a', patch, 43127, context('session-a'), base + 100)
    const running = markCreatorActivationRunning(harness, handle.transaction, base + 200)
    finishCreatorActivation(harness, running, { ok: true, hostAlive: true }, base + 300)
    handle.release()
    const previous = deadHost()
    writeHostState(harness, previous)
    armGuardian(harness, previous, base + 300)

    const first = await runGuardianCycle(harness, {
      now: () => base + 1_000,
      pidAlive: () => false,
      portOpen: async () => false,
      startHost: (_root, spec) => ({ ...deadHost(333), port: spec.port, ownership: 'spawned' }),
      waitForHttp: async () => true,
      readLogTail: () => 'failed to apply loader entry plugin-a (plugin-a)',
    })
    assert.equal(first.incident?.confidence, 'probable')
    assert.equal(first.incident?.pluginId, 'plugin-a')

    writeHostState(harness, deadHost())
    const control = readGuardianControl(harness)
    writeFileSync(join(harness, '.dshx/creator-plus/guardian-control.json'), `${JSON.stringify({
      ...control,
      consecutiveRecoveries: 0,
      lastRecoveryAt: new Date(base + 1_000).toISOString(),
    })}\n`)
    const second = await runGuardianCycle(harness, {
      now: () => base + 40_000,
      pidAlive: () => false,
      portOpen: async () => false,
      startHost: (_root, spec) => ({ ...deadHost(444), port: spec.port, ownership: 'spawned' }),
      waitForHttp: async () => true,
    })
    assert.equal(second.incident?.confidence, 'ambiguous')
    assert.equal(second.incident?.pluginId, undefined)
  })

  it('opens the crash-loop fuse instead of repeatedly restarting a bad target', async () => {
    const harness = root()
    const previous = deadHost()
    writeHostState(harness, previous)
    armGuardian(harness, previous, 10_000)
    const control = readGuardianControl(harness)
    writeFileSync(join(harness, '.dshx/creator-plus/guardian-control.json'), `${JSON.stringify({
      ...control,
      consecutiveRecoveries: 1,
      lastRecoveryAt: new Date(10_000).toISOString(),
    })}\n`)
    const result = await runGuardianCycle(harness, {
      now: () => 11_000,
      pidAlive: () => false,
      portOpen: async () => false,
    })
    assert.equal(result.action, 'fused')
    assert.equal(result.incident?.reason, 'crash-loop')
    assert.equal(readGuardianControl(harness).enabled, false)
    assert.equal(existsSync(join(harness, '.dshx/creator-plus/incidents.json')), true)
  })

  it('does not resurrect an adopted Host after its official launcher exits', async () => {
    const harness = root()
    const previous = { ...deadHost(), launcherPid: 123_456 }
    writeHostState(harness, previous)
    armGuardian(harness, previous)
    const result = await runGuardianCycle(harness, {
      pidAlive: pid => pid !== 123_456,
      portOpen: async () => false,
    })
    assert.equal(result.action, 'launcher-exited')
    assert.equal(readGuardianControl(harness).enabled, false)
  })

  it('does not let an in-flight old recovery clobber a newer App-host arm', async () => {
    const harness = root()
    const previous = deadHost(987_654)
    writeHostState(harness, previous)
    armGuardian(harness, { ...previous, ownership: 'spawned' }, 10_000)
    let resolveHealth!: (healthy: boolean) => void
    const health = new Promise<boolean>((resolve) => { resolveHealth = resolve })
    let started!: () => void
    const didStart = new Promise<void>((resolve) => { started = resolve })
    const cycle = runGuardianCycle(harness, {
      now: () => 11_000,
      pidAlive: () => false,
      portOpen: async () => false,
      startHost: (_root, spec) => {
        started()
        return { ...deadHost(222), port: spec.port, ownership: 'spawned' }
      },
      waitForHttp: async () => health,
      readLogTail: () => '',
    })
    await didStart

    const currentApp = {
      ...deadHost(process.pid),
      ownership: 'adopted' as const,
      launcherPid: process.ppid,
      startedAt: new Date(11_500).toISOString(),
    }
    writeHostState(harness, currentApp)
    armGuardian(harness, currentApp, 11_500)
    resolveHealth(false)

    const result = await cycle
    const control = readGuardianControl(harness)
    assert.equal(result.action, 'superseded')
    assert.equal(control.enabled, true)
    assert.equal(control.desired?.ownership, 'adopted')
    assert.equal(control.desired?.hostPid, process.pid)
    assert.equal(control.consecutiveRecoveries, 0)
  })

  it('stops a Guardian-spawned replacement when its adopted App launcher later exits', async () => {
    const harness = root()
    const adopted = { ...deadHost(), launcherPid: 123_456 }
    armGuardian(harness, adopted)
    writeHostState(harness, { ...adopted, pid: 222, ownership: 'spawned' })
    let stopped = false
    const result = await runGuardianCycle(harness, {
      pidAlive: pid => pid === 222,
      portOpen: async () => true,
      stopHost: async () => {
        stopped = true
        return readHostState(harness)
      },
    })
    assert.equal(result.action, 'launcher-exited')
    assert.equal(stopped, true)
    assert.equal(readGuardianControl(harness).enabled, false)
  })

  it('preserves App lifetime ownership through recovery and later Creator session arms', async () => {
    const harness = root()
    const launcherPid = 123_456
    const adopted = { ...deadHost(), launcherPid }
    writeHostState(harness, adopted)
    armGuardian(harness, adopted, 10_000)

    const recovered = { ...deadHost(222), ownership: 'spawned' as const }
    const first = await runGuardianCycle(harness, {
      now: () => 11_000,
      pidAlive: pid => pid === launcherPid,
      portOpen: async () => false,
      waitForExternalRecovery: async () => false,
      startHost: () => recovered,
      waitForHttp: async () => true,
      readLogTail: () => '',
    })
    assert.equal(first.action, 'restarted')
    assert.equal(readGuardianControl(harness).desired?.ownership, 'adopted')
    assert.equal(readGuardianControl(harness).desired?.launcherPid, launcherPid)

    writeHostState(harness, recovered)
    armGuardian(harness, recovered, 12_000)
    const rearmed = readGuardianControl(harness)
    assert.equal(rearmed.desired?.ownership, 'adopted')
    assert.equal(rearmed.desired?.launcherPid, launcherPid)
    assert.equal(rearmed.desired?.hostPid, recovered.pid)

    let stopped = false
    const second = await runGuardianCycle(harness, {
      now: () => 13_000,
      pidAlive: pid => pid === recovered.pid,
      portOpen: async () => true,
      stopHost: async () => {
        stopped = true
        return readHostState(harness)
      },
    })
    assert.equal(second.action, 'launcher-exited')
    assert.equal(stopped, true)
    assert.equal(readGuardianControl(harness).enabled, false)
  })
})
