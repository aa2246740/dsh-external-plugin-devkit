import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { clientEntryFindings } from '../src/internal/file-copy.ts'
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

describe('0.1.5 compat diagnostics', () => {
  it('fails dead 0.1.2 APIs and accepts the 0.1.5 replacements', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-compat-'))
    writePlugin(root, 'legacy', {
      'dshx.yml': 'id: legacy\nentry: src/legacy.ts\nmarker: "[legacy] loaded"\nkind: function\n',
      'src/legacy.ts': `import type { Context } from '@deepseek-ai/cordis'
import { MessageText } from '@deepseek-ai/dsh-client-ui-primitives'
export const inject = ['agent']
export function apply(ctx: Context) {
  ctx.agent.on('assistant/chunk', () => {})
  console.log('[legacy] loaded')
}
`,
      'src/ui.tsx': `export function Images(actions: { addImages(files: File[]): void }) {
  actions.addImages([])
  createDraftImages()
}
function createDraftImages() {}
`,
    })
    const broken = checkPlugin(loadPlugin(root, 'legacy'), root)
    const codes = broken.filter(item => item.level === 'error').map(item => item.code)
    assert.ok(codes.includes('compat-015-message-text'), JSON.stringify(broken, null, 2))
    assert.ok(codes.includes('compat-015-add-images'), JSON.stringify(broken, null, 2))
    assert.ok(codes.includes('compat-015-create-draft-images'), JSON.stringify(broken, null, 2))
    assert.ok(codes.includes('compat-015-assistant-chunk'), JSON.stringify(broken, null, 2))
    assert.ok(codes.includes('compat-015-ctx-agent'), JSON.stringify(broken, null, 2))

    writePlugin(root, 'current', {
      'dshx.yml': 'id: current\nentry: src/current.ts\nmarker: "[current] loaded"\nkind: function\n',
      'src/current.ts': `import type { Context } from '@deepseek-ai/cordis'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
export const inject = ['agents']
export function apply(ctx: Context) {
  ctx.agents.get('x')
  ctx.agentLoop.create
  console.log('[current] loaded')
}
`,
      'src/ui.tsx': `export function Attachments(actions: { addAttachments(ids: string[]): void }) {
  actions.addAttachments([])
}
`,
    })
    const ok = checkPlugin(loadPlugin(root, 'current'), root)
    assert.equal(ok.some(item => item.code.startsWith('compat-015-') && item.level === 'error'), false, JSON.stringify(ok, null, 2))
  })
})

describe('out-of-tree client build diagnostics', () => {
  it('rejects a missing relative tsconfig base despite an existing valid old bundle', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-build-config-'))
    const dir = writePlugin(root, 'example', {
      'package.json': JSON.stringify({ name: 'example', exports: { './client': './lib/client.js' }, dsh: { client: { platform: 'web', inject: [] } } }),
      'tsconfig.json': '{ // valid JSONC\n "extends": "../../missing-client-base" }',
      'lib/client.js': 'window.__ModuleLoader__.load({ id: "example", factory: function() {} })',
    })
    const linkParent = join(root, 'runtime', 'my-plugins')
    mkdirSync(linkParent, { recursive: true })
    symlinkSync(dir, join(linkParent, 'example'))
    writeText(join(root, 'runtime', 'missing-client-base.json'), '{}')
    assert.ok(clientEntryFindings(join(linkParent, 'example')).some(f => f.code === 'client-build-config' && f.level === 'error'), 'resolve relative config from the real source, not the Harness symlink')
    const before = clientEntryFindings(dir)
    assert.ok(before.some(f => f.code === 'client-entry' && f.level === 'ok'))
    assert.ok(before.some(f => f.code === 'client-build-config' && f.level === 'error'))
    writeText(join(root, 'missing-client-base.json'), '{}')
    const after = clientEntryFindings(dir)
    assert.ok(!after.some(f => f.code === 'client-build-config' && f.level === 'error'))
    assert.ok(after.some(f => f.code === 'client-build-proof'))
  })

  it('rejects a tsdown template that requires DSHX_HARNESS and the config file to agree', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-harness-pin-'))
    const dir = writePlugin(root, 'pinned', {
      'package.json': JSON.stringify({ name: 'pinned', exports: { './client': './lib/client.js' }, dsh: { client: { platform: 'web', inject: [] } } }),
      'tsdown.config.ts': `function resolveHarness() {
  const configured = process.env.DSHX_HARNESS?.trim()
  const recorded = '/tmp/recorded'
  const roots = [...new Set([configured, recorded].filter(Boolean))]
  if (roots.length !== 1) throw new Error('dshx client build requires one Harness root from DSHX_HARNESS or ~/.config/dshx/harness')
  return roots[0]
}
export default { adapter: resolveHarness() }
`,
    })
    const findings = clientEntryFindings(dir)
    assert.ok(findings.some(item => item.code === 'client-harness-pin' && item.level === 'error'), JSON.stringify(findings, null, 2))
  })
})
