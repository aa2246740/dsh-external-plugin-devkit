import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { loadRubric, scoreEvents, type ObserveEvent } from '../src/internal/experiment.ts'

function ev(partial: ObserveEvent): ObserveEvent {
  return { ts: '2026-08-17T00:00:00Z', experiment: 't', ...partial }
}

describe('experiment score', () => {
  it('fails retry-ux when the agent only searches', () => {
    const score = scoreEvents([
      ev({ kind: 'cli', command: 'kb' }),
      ev({ kind: 'kb', op: 'search', query: 'retry' }),
    ], 't', loadRubric('retry-ux'))
    assert.equal(score.ok, false)
    assert.equal(score.checks.find(check => check.code === 'walk')?.ok, false)
    assert.equal(score.checks.find(check => check.code === 'cat-any')?.ok, false)
  })

  it('passes retry-ux on search then cat of llm-retry', () => {
    const score = scoreEvents([
      ev({ kind: 'cli', command: 'kb' }),
      ev({ kind: 'kb', op: 'search', query: 'timeout' }),
      ev({ kind: 'kb', op: 'cat', id: 'contracts/llm-retry' }),
    ], 't', loadRubric('retry-ux'))
    assert.equal(score.ok, true, score.checks.filter(check => !check.ok).map(check => check.message).join('; '))
  })

  it('fails mixed-ux when only the retry side is catted', () => {
    const score = scoreEvents([
      ev({ kind: 'cli', command: 'kb' }),
      ev({ kind: 'kb', op: 'search', query: 'timeout' }),
      ev({ kind: 'kb', op: 'cat', id: 'contracts/llm-retry' }),
    ], 't', loadRubric('mixed-ux'))
    assert.equal(score.checks.find(check => check.code === 'cat-group-1')?.ok, true)
    assert.equal(score.checks.find(check => check.code === 'cat-group-2')?.ok, false)
    assert.equal(score.ok, false)
  })

  it('requires verify for boot-proof', () => {
    const score = scoreEvents([
      ev({ kind: 'cli', command: 'kb' }),
      ev({ kind: 'kb', op: 'cat', id: 'playbooks/verify-boot' }),
      ev({ kind: 'cli', command: 'init' }),
      ev({ kind: 'cli', command: 'check' }),
    ], 't', loadRubric('boot-proof'))
    assert.equal(score.checks.find(check => check.code === 'commands')?.ok, false)
  })
})
