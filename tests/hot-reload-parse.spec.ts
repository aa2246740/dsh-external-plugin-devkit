import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseCli } from '../src/internal/io.ts'

describe('hot-reload CLI scope parsing', () => {
  it('defaults to root and accepts the explicit preset scope only for hot-reload', () => {
    assert.equal(parseCli(['hot-reload', 'demo']).options.scope, 'root')
    const preset = parseCli(['hot-reload', 'demo', '--scope', 'preset'])
    assert.equal(preset.options.scope, 'preset')
    assert.deepEqual(preset.args, ['demo'])
  })

  it('rejects invalid, missing, and pre-command scope on other commands', () => {
    assert.throws(() => parseCli(['hot-reload', 'demo', '--scope', 'all']), /must be root or preset/)
    assert.throws(() => parseCli(['hot-reload', 'demo', '--scope']), /must be root or preset/)
    assert.throws(() => parseCli(['--scope', 'preset', 'check', 'demo']), /only valid for hot-reload/)
  })

  it('rejects a post-command scope flag on commands that do not own it', () => {
    assert.throws(() => parseCli(['check', 'demo', '--scope', 'preset']), /only valid for hot-reload/)
  })
})
