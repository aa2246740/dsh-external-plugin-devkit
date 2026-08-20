import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { activationDecision } from '../src/internal/activation.ts'

const facts = {
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
  })

  it('defaults server module replacement to a controlled restart', () => {
    const decision = activationDecision('server', facts)
    assert.equal(decision.hostRestart, 'required')
  })

  it('never turns artifact synchronization into an activation claim', () => {
    const decision = activationDecision('artifact', facts)
    assert.equal(decision.hostRestart, 'not-decided')
    assert.match(decision.proof.join(' '), /not LIVE_ACTIVATION_PROVEN/)
  })
})
