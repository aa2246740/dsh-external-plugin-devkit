import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { activationDecision } from '../src/internal/activation.ts'

const facts = {
  bundleDeclared: true,
  bundleRegistered: true,
  hasClient: true,
  inOfflineComposition: true,
  packageResolvable: true,
}

describe('activation lifecycle decisions', () => {
  it('keeps watched patch updates in the current host process', () => {
    const decision = activationDecision('patch', facts)
    assert.equal(decision.hostRestart, 'not-required')
    assert.equal(decision.browserReload, 'conditional')
  })

  it('treats profile manifest changes as next-boot composition', () => {
    const decision = activationDecision('manifest', facts)
    assert.equal(decision.hostRestart, 'required')
    assert.match(decision.restartReason, /captured only when the Host boots/)
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
    assert.match(decision.blockers.join(' '), /boot-captured bundle evidence/)
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
    assert.equal(added.browserReload, 'required')
    assert.match(added.preconditions.join(' '), /dependency.*prerequisite.*not make this a manifest branch/)
  })

  it('defaults server module replacement to a controlled restart', () => {
    const decision = activationDecision('server', facts)
    assert.equal(decision.hostRestart, 'required')
  })

  it('never turns artifact synchronization into an activation claim', () => {
    const decision = activationDecision('artifact', facts)
    assert.equal(decision.hostRestart, 'not-required')
    assert.match(decision.proof.join(' '), /not LIVE_ACTIVATION_PROVEN/)
  })
})
