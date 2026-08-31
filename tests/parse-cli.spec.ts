import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dshManagedShellAllows, parseCli } from '../src/internal/io.ts'

describe('parseCli', () => {
  it('keeps Host and live-profile mutation out of DSH-managed model shells', () => {
    const managed = { DSH_SHELL: '1' }
    assert.equal(dshManagedShellAllows('status', managed), true)
    assert.equal(dshManagedShellAllows('check', managed), true)
    assert.equal(dshManagedShellAllows('start', managed), false)
    assert.equal(dshManagedShellAllows('restart-supervised', managed), false)
    assert.equal(dshManagedShellAllows('activate-new-client', managed), false)
    assert.equal(dshManagedShellAllows('plugin', managed, ['remove', 'demo']), false)
    assert.equal(dshManagedShellAllows('sync-artifact', managed), false)
    assert.equal(dshManagedShellAllows('update', managed, ['plan']), true)
    assert.equal(dshManagedShellAllows('update', managed, ['prepare']), false)
    assert.equal(dshManagedShellAllows('start', {}), true)
  })
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

  it('applies --harness to every command before or after the command name', () => {
    const after = parseCli(['check', 'demo', '--harness', '/tmp/rc8'])
    assert.equal(after.command, 'check')
    assert.deepEqual(after.args, ['demo'])
    assert.equal(after.options.harness, '/tmp/rc8')

    const before = parseCli(['--harness', '/tmp/rc8', 'doctor'])
    assert.equal(before.command, 'doctor')
    assert.deepEqual(before.args, [])
    assert.equal(before.options.harness, '/tmp/rc8')
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

  it('parses the user-preset lifecycle branch', () => {
    const plan = parseCli(['activation-plan', 'dsh-creator-plus', '--change', 'preset'])
    assert.equal(plan.options.change, 'preset')
  })

  it('parses bounded new-client activation flags without leaking them into arguments', () => {
    const activation = parseCli(['activate-new-client', 'demo', '--profile', 'web', '--port', '43127', '--timeout', '12'])
    assert.equal(activation.command, 'activate-new-client')
    assert.deepEqual(activation.args, ['demo'])
    assert.equal(activation.options.profile, 'web')
    assert.equal(activation.options.port, 43127)
    assert.equal(activation.options.timeoutMs, 12_000)
  })

  it('keeps safe bundle removal flags on the plugin command', () => {
    const parsed = parseCli(['plugin', 'remove', 'dsh-ade', '--profile', 'web', '--port', '43127', '--timeout', '12'])
    assert.equal(parsed.command, 'plugin')
    assert.deepEqual(parsed.args, ['remove', 'dsh-ade'])
    assert.equal(parsed.options.profile, 'web')
    assert.equal(parsed.options.port, 43127)
    assert.equal(parsed.options.timeoutMs, 12_000)
  })

  it('parses update target and candidate without leaking flags into arguments', () => {
    const update = parseCli(['update', 'prepare', '--target', 'dsh-v0.1.1-rc.2', '--candidate', '/tmp/rc2'])
    assert.equal(update.command, 'update')
    assert.deepEqual(update.args, ['prepare'])
    assert.equal(update.options.target, 'dsh-v0.1.1-rc.2')
    assert.equal(update.options.candidate, '/tmp/rc2')
  })
})
