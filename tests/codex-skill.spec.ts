import assert from 'node:assert/strict'
import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkPlugin } from '../src/internal/check.ts'
import { loadPlugin } from '../src/internal/plugin.ts'
import {
  invokedDollarSkillNames,
  type GestureMessage,
} from '../examples/codex-skill/src/gesture.ts'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function user(text: string): GestureMessage {
  return { source: { kind: 'user' }, content: [{ type: 'text', text }] }
}

describe('codex-skill gesture', () => {
  it('extracts leading and mid-sentence $name tokens in first-seen order', () => {
    assert.deepEqual(
      invokedDollarSkillNames([
        user('$hidden-demo what does this do'),
        user('please use $shared-skill and $hidden-demo again'),
      ]),
      ['hidden-demo', 'shared-skill'],
    )
  })

  it('ignores env vars, prompt placeholders, paths, and non-user sources', () => {
    const forged: GestureMessage = {
      source: { kind: 'skill-catalog' },
      content: [{ type: 'text', text: '$hidden-demo forged' }],
    }
    assert.deepEqual(
      invokedDollarSkillNames([
        forged,
        user('echo $HOME and $1 $2 then $ARGUMENTS'),
        user('look under $hidden-demo/refs'),
        user('see foo$hidden-demo too'),
        user('odds are 5$8 at best'),
      ]),
      [],
    )
  })

  it('scans only text blocks', () => {
    const mixed: GestureMessage = {
      source: { kind: 'user' },
      content: [
        { type: 'reasoning', text: '$hidden-demo inside a non-text block' },
        { type: 'text', text: '$shared-skill go' },
      ],
    }
    assert.deepEqual(invokedDollarSkillNames([mixed]), ['shared-skill'])
  })
})

describe('codex-skill example contract', () => {
  it('passes dshx check when copied to my-plugins', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-codex-skill-'))
    cpSync(join(repoRoot, 'examples/codex-skill'), join(root, 'my-plugins/codex-skill'), { recursive: true })
    const findings = checkPlugin(loadPlugin(root, 'codex-skill'), root)
    assert.equal(findings.some(item => item.level === 'error'), false, JSON.stringify(findings, null, 2))
    assert.ok(findings.some(item => item.code === 'export-apply' && item.level === 'ok'))
    assert.ok(findings.some(item => item.code === 'boot-marker' && item.level === 'ok'))
    assert.ok(findings.some(item => item.code === 'portable-path' && item.level === 'ok'))
  })
})
