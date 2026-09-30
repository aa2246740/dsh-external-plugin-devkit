import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { activationDecision } from '../src/internal/activation.ts'
import { activationCapabilities } from '../src/internal/activation-capabilities.ts'

const facts = {
  id: 'demo',
  bundleDeclared: true,
  bundleRegistered: true,
  hasClient: true,
  inOfflineComposition: true,
  packageResolvable: true,
  capabilities: activationCapabilities('0.2.0-rc.2', [
    { id: 'hmr', name: '@deepseek-ai/dsh-hmr' },
    { id: 'client-hmr', name: '@deepseek-ai/dsh-client-hmr' },
  ], 'calling-host'),
}

describe('activation lifecycle decisions', () => {
  it('keeps shipped agent guidance aligned with the undecided server branch', () => {
    for (const path of ['../src/help.ts', '../skill/dshx/SKILL.md', '../creator-plus/skills/creator-mode-plus/SKILL.md']) {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8')
      assert.doesNotMatch(source, /无专项证据则受控重启|Yes by default|`manifest` or `server`:/, path)
      assert.match(source, /not-decided|未确定/, path)
    }
  })

  it('keeps watched patch updates in the current host process', () => {
    const decision = activationDecision('patch', facts)
    assert.equal(decision.hostRestart, 'not-required')
    assert.equal(decision.browserReload, 'not-required')
  })

  it('uses RC2 profile HMR for bundle changes on the current Host', () => {
    const decision = activationDecision('manifest', facts)
    assert.equal(decision.hostRestart, 'not-required')
    assert.match(decision.restartReason, /watches bundle selection/)
    assert.equal(decision.browserReload, 'not-required')
  })

  it('rejects a plain dependency edit as manifest restart evidence', () => {
    const decision = activationDecision('manifest', {
      ...facts,
      bundleDeclared: false,
      bundleRegistered: false,
      inOfflineComposition: false,
    })
    assert.equal(decision.hostRestart, 'not-required')
    assert.match(decision.restartReason, /dependency link alone/)
    assert.match(decision.blockers.join(' '), /requires bundle evidence/)
  })

  it('discovers a user preset without restarting but requires a new session generation', () => {
    const decision = activationDecision('preset', facts)
    assert.equal(decision.hostRestart, 'not-required')
    assert.equal(decision.browserReload, 'conditional')
    assert.match(decision.proof.join(' '), /new session|blank session/)
  })

  it('separates existing and new client entries', () => {
    const existing = activationDecision('client', facts)
    assert.equal(existing.hostRestart, 'not-required')
    assert.equal(existing.browserReload, 'not-required')
    const added = activationDecision('new-client', facts)
    assert.equal(added.hostRestart, 'not-required')
    assert.equal(added.browserReload, 'not-required')
    assert.match(added.preconditions.join(' '), /dependency.*prerequisite.*not make this a manifest branch/)
  })

  it('does not infer a restart or reload when runtime capability is unknown', () => {
    const unknown = { ...facts, capabilities: undefined }
    assert.equal(activationDecision('manifest', unknown).hostRestart, 'not-decided')
    assert.equal(activationDecision('new-client', unknown).browserReload, 'not-decided')
  })

  it('keeps a profile without HMR and a page without graph sync explicit', () => {
    const unsupported = { ...facts, capabilities: activationCapabilities('0.2.0-rc.2', [], 'calling-host') }
    assert.equal(activationDecision('manifest', unsupported).hostRestart, 'required')
    assert.equal(activationDecision('new-client', unsupported).browserReload, 'required')
  })

  it('does not substitute RC2 checkout assumptions for an older calling runtime', () => {
    const old = { ...facts, capabilities: activationCapabilities('0.1.7-rc.2', [
      { id: 'hmr', name: '@deepseek-ai/dsh-hmr' },
      { id: 'client-hmr', name: '@deepseek-ai/dsh-client-hmr' },
    ], 'calling-host') }
    assert.equal(activationDecision('manifest', old).hostRestart, 'not-decided')
    assert.equal(activationDecision('new-client', old).browserReload, 'not-decided')
  })

  it('provides bounded hot reload as the next server operation without claiming activation or restart authority', () => {
    const decision = activationDecision('server', facts)
    assert.equal(decision.hostRestart, 'not-decided')
    assert.match(decision.method, /bounded.*hot.reload/i)
    assert.deepEqual(decision.blockers, [])
    assert.deepEqual(decision.nextAction, { tool: 'dshx_hot_reload', arguments: { name: facts.id } })
    assert.match(decision.proof.join(' '), /same.PID|same pid/i)
    assert.doesNotMatch(`${decision.method} ${decision.restartReason}`, /has no explicit.*module-HMR/i)
  })

  it('never turns artifact synchronization into an activation claim', () => {
    const decision = activationDecision('artifact', facts)
    assert.equal(decision.hostRestart, 'not-required')
    assert.match(decision.proof.join(' '), /not LIVE_ACTIVATION_PROVEN/)
  })
})
