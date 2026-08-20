import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { installCreatorPlus } from '../scripts/install-creator-plus.mjs'
import { apply } from '../src/creator-plus/index.js'
import { resolveHarnessRoot, runDshx } from '../src/creator-plus/runner.js'

const temporaryRoots: string[] = []

function temporaryDirectory(label: string): string {
  const path = mkdtempSync(join(tmpdir(), label))
  temporaryRoots.push(path)
  return path
}

function harnessAt(root: string): string {
  mkdirSync(join(root, 'apps/cli/src'), { recursive: true })
  mkdirSync(join(root, 'apps/cli/config/agent-presets/standard'), { recursive: true })
  mkdirSync(join(root, 'tools/dshx/src'), { recursive: true })
  writeFileSync(join(root, 'apps/cli/src/bin.ts'), '')
  writeFileSync(join(root, 'tools/dshx/src/cli.ts'), '')
  writeFileSync(join(root, 'apps/cli/config/agent-presets/standard/preset.yml'), 'name: Standard\n')
  writeFileSync(join(root, 'apps/cli/config/agent-presets/standard/agent.cordis.yml'), `# The \`standard\` agent preset: the full coding agent, mounted once per process.
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: >-
      You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.
- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
- id: tool-skill
  name: '@deepseek-ai/dsh-tool-skill'
`)
  return root
}

afterEach(() => {
  for (const path of temporaryRoots.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('Creator Mode+ bridge', () => {
  it('registers only the four fixed non-process-control tools', () => {
    const tools: Array<Record<string, unknown>> = []
    apply({ tools: { register(tool: Record<string, unknown>) { tools.push(tool) } } })

    assert.deepEqual(tools.map(tool => tool.name), [
      'dshx_scaffold',
      'dshx_check',
      'dshx_activation_plan',
      'dshx_status',
    ])
    assert.equal(tools.some(tool => /start|stop|restart|shell|command/.test(String(tool.name))), false)
    assert.throws(
      () => (tools[1]!.execute as (args: object, exec: object) => unknown)({ name: '../escape' }, { signal: undefined }),
      /lower-case kebab-case/,
    )
    assert.throws(() => runDshx(['restart']), /fixed command allowlist/)
  })

  it('resolves an explicit checkout and walks upward', () => {
    const root = harnessAt(temporaryDirectory('dshx-creator-root-'))
    const nested = join(root, 'workspace/example/src')
    mkdirSync(nested, { recursive: true })
    assert.equal(resolveHarnessRoot({ envRoot: root, configFile: '/missing', cwd: '/missing', moduleDir: '/missing' }), root)
    assert.equal(resolveHarnessRoot({ configFile: '/missing', cwd: nested, moduleDir: '/missing' }), root)
  })

  it('fails closed on invalid or conflicting checkout authority', () => {
    const first = harnessAt(temporaryDirectory('dshx-creator-first-'))
    const second = harnessAt(temporaryDirectory('dshx-creator-second-'))
    assert.throws(
      () => resolveHarnessRoot({ envRoot: '/missing', configFile: '/missing', cwd: first, moduleDir: '/missing' }),
      /DSHX_HARNESS is not a Harness checkout/,
    )
    assert.throws(
      () => resolveHarnessRoot({ envRoot: first, configFile: '/missing', cwd: second, moduleDir: '/missing' }),
      /multiple Harness checkouts found/,
    )
  })

  it('copies Standard into a user preset without changing shipped files', () => {
    const harnessRoot = harnessAt(temporaryDirectory('dshx-creator-harness-'))
    const dshHome = temporaryDirectory('dshx-creator-home-')
    const source = join(harnessRoot, 'apps/cli/config/agent-presets/standard/agent.cordis.yml')
    const before = readFileSync(source, 'utf8')

    const target = installCreatorPlus({ harnessRoot, dshHome })
    const composition = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')

    assert.equal(readFileSync(source, 'utf8'), before)
    assert.match(composition, /You are Creator Mode\+/)
    assert.match(composition, /name: dsh-external-plugin-devkit\/creator-plus/)
    assert.equal(existsSync(join(target, 'skills/creator-mode-plus/SKILL.md')), true)
    assert.match(readFileSync(join(target, 'preset.yml'), 'utf8'), /Creator Mode\+/)
    assert.throws(() => installCreatorPlus({ harnessRoot, dshHome }), /refusing to overwrite/)
  })
})
