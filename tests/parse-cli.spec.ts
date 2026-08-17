import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseCli } from '../src/internal/io.ts'

describe('parseCli', () => {
  it('treats kb search --keep as a query, not verify --keep', () => {
    const parsed = parseCli(['kb', 'search', '--keep'])
    assert.equal(parsed.command, 'kb')
    assert.deepEqual(parsed.args, ['search', '--keep'])
    assert.equal(parsed.options.keep, false)
  })

  it('still applies --keep on verify', () => {
    const parsed = parseCli(['verify', 'hello', '--keep', '--port', '3091'])
    assert.equal(parsed.command, 'verify')
    assert.deepEqual(parsed.args, ['hello'])
    assert.equal(parsed.options.keep, true)
    assert.equal(parsed.options.port, 3091)
  })

  it('stops option parsing at --', () => {
    const parsed = parseCli(['kb', 'search', '--', '--force'])
    assert.deepEqual(parsed.args, ['search', '--force'])
    assert.equal(parsed.options.force, false)
  })

  it('keeps --json global and --port before the command', () => {
    const parsed = parseCli(['--json', '--port', '3091', 'start', 'web', 'hello'])
    assert.equal(parsed.command, 'start')
    assert.deepEqual(parsed.args, ['web', 'hello'])
    assert.equal(parsed.options.json, true)
    assert.equal(parsed.options.port, 3091)
  })
})
