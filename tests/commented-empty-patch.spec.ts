import assert from 'node:assert/strict'
import test from 'node:test'
import yaml from 'js-yaml'
import { planWatchedPatch } from '../src/internal/new-client.ts'

test('official commented empty user patch becomes a valid list and preserves comments', () => {
  const before = '# user patches\n# overrides, disables, and inserts\n[]\n'
  const result = planWatchedPatch(before, 'dsh-hot-control', 'dsh-hot-control')
  assert.deepEqual(yaml.load(result.after), [{ insert: [{ id: 'dsh-hot-control', name: 'dsh-hot-control' }] }])
  assert.ok(result.after.startsWith('# user patches\n# overrides, disables, and inserts\n'))
})

test('empty-list inline comment survives insertion', () => {
  const result = planWatchedPatch('# keep\n[] # empty so far\n', 'dsh-hot-control', 'dsh-hot-control')
  assert.ok(result.after.includes('# empty so far'))
  assert.equal((yaml.load(result.after) as unknown[]).length, 1)
})

test('unsupported flow-list append is rejected by planner before disk mutation', () => {
  assert.throws(() => planWatchedPatch('[{id: another, disabled: true}]\n', 'dsh-hot-control', 'dsh-hot-control'))
})
