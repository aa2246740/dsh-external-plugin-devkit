import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { checkPlugin } from '../src/internal/check.ts'
import { writeText } from '../src/internal/io.ts'
import { loadPlugin } from '../src/internal/plugin.ts'

function writePlugin(root: string, name: string, files: Record<string, string>): string {
  const dir = join(root, 'my-plugins', name)
  for (const [rel, text] of Object.entries(files)) writeText(join(dir, rel), text)
  return dir
}

describe('checkPlugin', () => {
  it('fails default export and absolute cordis.yml paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-check-'))
    writePlugin(root, 'broken', {
      'dshx.yml': 'id: broken\nentry: src/broken.ts\nmarker: "[my-plugins/broken] loaded"\nkind: function\n',
      'cordis.yml': "- insert:\n    - id: broken\n      name: '/workspace/my-plugins/broken/src/broken.ts'\n",
      'src/broken.ts': `import type { Context } from '@deepseek-ai/cordis'
export default function apply(_ctx: Context) {
  console.log('[my-plugins/broken] loaded')
}
`,
    })
    const findings = checkPlugin(loadPlugin(root, 'broken'), root)
    const codes = findings.filter(item => item.level === 'error').map(item => item.code)
    assert.ok(codes.includes('default-export'), JSON.stringify(findings, null, 2))
    assert.ok(codes.includes('export-apply'), JSON.stringify(findings, null, 2))
    assert.ok(codes.includes('portable-path'), JSON.stringify(findings, null, 2))
  })

  it('fails a tool plugin that does not inject tools', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-check-'))
    writePlugin(root, 'mute', {
      'dshx.yml': 'id: mute\nentry: src/mute.ts\nmarker: "[my-plugins/mute] loaded"\nkind: tool\n',
      'src/mute.ts': `import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
export const name = 'mute'
export const inject = []
export function apply(_ctx: Context) {
  console.log('[my-plugins/mute] loaded')
  defineTool({ name: 'mute_ping', description: 'x', parameters: {}, async execute() { return 'x' } })
}
`,
    })
    const findings = checkPlugin(loadPlugin(root, 'mute'), root)
    assert.ok(findings.some(item => item.code === 'inject-tools' && item.level === 'error'), JSON.stringify(findings, null, 2))
  })

  it('accepts a namespace function without optional name or inject exports', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-check-'))
    writePlugin(root, 'minimal', {
      'dshx.yml': 'id: minimal\nentry: src/minimal.ts\nmarker: "[minimal] loaded"\nkind: function\n',
      'src/minimal.ts': `export function apply() { console.log('[minimal] loaded') }\n`,
    })
    const findings = checkPlugin(loadPlugin(root, 'minimal'), root)
    assert.equal(findings.some(item => item.level === 'error'), false, JSON.stringify(findings, null, 2))
  })

  it('accepts the official default object form', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-check-'))
    writePlugin(root, 'object-form', {
      'dshx.yml': 'id: object-form\nentry: src/index.ts\nmarker: "[object] loaded"\nkind: object\n',
      'src/index.ts': `export default { apply() { console.log('[object] loaded') } }\n`,
    })
    const findings = checkPlugin(loadPlugin(root, 'object-form'), root)
    assert.ok(findings.some(item => item.code === 'object-form' && item.level === 'ok'), JSON.stringify(findings, null, 2))
    assert.equal(findings.some(item => item.level === 'error'), false, JSON.stringify(findings, null, 2))
  })

  it('accepts the official default class form', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-check-'))
    writePlugin(root, 'class-form', {
      'dshx.yml': 'id: class-form\nentry: src/index.ts\nmarker: "[class] loaded"\nkind: class\n',
      'src/index.ts': `export default class Plugin { constructor() { console.log('[class] loaded') } }\n`,
    })
    const findings = checkPlugin(loadPlugin(root, 'class-form'), root)
    assert.ok(findings.some(item => item.code === 'class-form' && item.level === 'ok'), JSON.stringify(findings, null, 2))
    assert.equal(findings.some(item => item.level === 'error'), false, JSON.stringify(findings, null, 2))
  })
})
