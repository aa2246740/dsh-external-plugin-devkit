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

  it('parses setup and ship flags', () => {
    const setup = parseCli(['setup', '--dry-run', '--print-prompt', '--harness', '/tmp/h'])
    assert.equal(setup.command, 'setup')
    assert.equal(setup.options.dryRun, true)
    assert.equal(setup.options.printPrompt, true)
    assert.equal(setup.options.harness, '/tmp/h')
    const ship = parseCli(['ship', './pkg', '--restart', '--profile', 'web'])
    assert.equal(ship.command, 'ship')
    assert.deepEqual(ship.args, ['./pkg'])
    assert.equal(ship.options.restart, true)
    assert.equal(ship.options.profile, 'web')
  })

  it('parses lifecycle commands without leaking flags into arguments', () => {
    const plan = parseCli(['activation-plan', 'demo', '--change', 'new-client', '--profile', 'web'])
    assert.equal(plan.command, 'activation-plan')
    assert.deepEqual(plan.args, ['demo'])
    assert.equal(plan.options.change, 'new-client')
    const verify = parseCli(['verify-boot', 'demo', '--keep'])
    assert.equal(verify.command, 'verify-boot')
    assert.deepEqual(verify.args, ['demo'])
    assert.equal(verify.options.keep, true)
  })
})
