import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import {
  captureOfficialPluginDisables,
  ensureCompositionRowDisabled,
  officialDisableOnlyDirty,
  persistOfficialPluginPolicy,
  restampOfficialPluginDisables,
} from '../src/internal/official-plugin-policy.ts'

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

function git(root: string, args: readonly string[]): void {
  execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' })
}

const OFFICIAL = `- id: command-goal
  name: '@deepseek-ai/dsh-command-goal'

- id: tool-goal
  name: '@deepseek-ai/dsh-tool-goal'

- id: planning
  name: cordis:group
  group: true
  config:
    - id: plan-mode
      name: '@deepseek-ai/dsh-plan-mode'

- id: tool-subagent-codex
  name: '@deepseek-ai/dsh-tool-subagent'
  disabled: true
`

function harnessWithPresets(): { root: string; home: string; env: NodeJS.ProcessEnv } {
  const root = mkdtempSync(join(tmpdir(), 'dshx-official-disable-'))
  const home = join(root, '.test-dsh-home')
  write(join(root, 'apps/cli/src/bin.ts'), 'export {}\n')
  write(join(root, 'tools/dshx/src/cli.ts'), 'export {}\n')
  write(join(root, 'package.json'), '{"version":"0.1.0-rc.8"}\n')
  write(join(root, 'packages/preset/agent-presets/presets/standard/agent.cordis.yml'), OFFICIAL)
  write(join(root, 'packages/preset/agent-presets/presets/ptc/agent.cordis.yml'), OFFICIAL)
  git(root, ['init'])
  git(root, ['config', 'user.email', 'dshx@example.invalid'])
  git(root, ['config', 'user.name', 'DSHX Test'])
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'official'])
  return { root, home, env: { ...process.env, DSH_HOME: home } }
}

describe('official plugin disable policy', () => {
  it('inserts disabled: true after the name field and leaves !!js alone', () => {
    const inserted = ensureCompositionRowDisabled(OFFICIAL, 'command-goal')
    assert.equal(inserted.found, true)
    assert.equal(inserted.changed, true)
    assert.match(inserted.text, /- id: command-goal\n  name: '@deepseek-ai\/dsh-command-goal'\n  disabled: true/)

    const js = ensureCompositionRowDisabled('- id: tool-bash\n  name: x\n  disabled: !!js false\n', 'tool-bash')
    assert.equal(js.found, true)
    assert.equal(js.changed, false)
  })

  it('captures user disables and ignores factory-disabled official rows', () => {
    const { root, home, env } = harnessWithPresets()
    write(join(root, 'packages/preset/agent-presets/presets/standard/agent.cordis.yml'), OFFICIAL.replace(
      '- id: command-goal\n  name: \'@deepseek-ai/dsh-command-goal\'\n',
      '- id: command-goal\n  name: \'@deepseek-ai/dsh-command-goal\'\n  disabled: true\n',
    ))
    write(join(home, '.agent-presets/creator-plus/agent.cordis.yml'), `- id: tool-goal
  name: '@deepseek-ai/dsh-tool-goal'
  disabled: true
- id: tool-subagent-codex
  name: '@deepseek-ai/dsh-tool-subagent'
  disabled: true
`)
    write(join(home, 'profiles/web/cordis.patch.yml'), '- id: ui-goal\n  disabled: true\n')

    const policy = captureOfficialPluginDisables(root, env)
    assert.deepEqual(policy.disables.map(item => item.id).sort(), ['command-goal', 'tool-goal', 'ui-goal'])
    assert.deepEqual(policy.disables.find(item => item.id === 'command-goal')?.surfaces, ['preset:standard'])
    assert.deepEqual(policy.disables.find(item => item.id === 'tool-goal')?.surfaces, ['preset:creator-plus'])
    assert.deepEqual(policy.disables.find(item => item.id === 'ui-goal')?.surfaces, ['profile:web'])
    assert.equal(policy.disables.some(item => item.id === 'tool-subagent-codex'), false)
  })

  it('never drops a stored disable when the working tree no longer shows it', () => {
    const { root, home, env } = harnessWithPresets()
    persistOfficialPluginPolicy(home, {
      schemaVersion: 1,
      updatedAt: '2026-09-11T00:00:00.000Z',
      disables: [{ id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode', surfaces: ['preset:standard'] }],
    })
    const policy = captureOfficialPluginDisables(root, env)
    assert.equal(policy.disables.some(item => item.id === 'plan-mode' && item.surfaces.includes('preset:standard')), true)
  })

  it('treats official-disable-only shipped edits as update-safe dirty', () => {
    const { root, home, env } = harnessWithPresets()
    const path = join(root, 'packages/preset/agent-presets/presets/standard/agent.cordis.yml')
    const next = ensureCompositionRowDisabled(OFFICIAL, 'plan-mode')
    write(path, next.text)
    const policy = captureOfficialPluginDisables(root, env)
    assert.equal(officialDisableOnlyDirty(root, ['packages/preset/agent-presets/presets/standard/agent.cordis.yml'], policy), true)
    write(path, OFFICIAL.replace("name: '@deepseek-ai/dsh-command-goal'", "name: '@deepseek-ai/dsh-command-goal-renamed'"))
    assert.equal(officialDisableOnlyDirty(root, ['packages/preset/agent-presets/presets/standard/agent.cordis.yml'], policy), false)
    assert.equal(officialDisableOnlyDirty(root, ['package.json'], policy), false)
  })

  it('restamps shipped presets after the official bytes come back', () => {
    const { root, home, env } = harnessWithPresets()
    persistOfficialPluginPolicy(home, {
      schemaVersion: 1,
      updatedAt: '2026-09-11T00:00:00.000Z',
      disables: [
        { id: 'command-goal', name: '@deepseek-ai/dsh-command-goal', surfaces: ['preset:standard', 'preset:ptc'] },
        { id: 'ui-goal', name: '@deepseek-ai/dsh-client-ui-goal', surfaces: ['profile:web'] },
      ],
    })
    write(join(home, 'profiles/web/cordis.patch.yml'), '- id: ui-goal\n  disabled: true\n')
    const result = restampOfficialPluginDisables(root, captureOfficialPluginDisables(root, env), env)
    assert.equal(result.changedPaths.includes('packages/preset/agent-presets/presets/standard/agent.cordis.yml'), true)
    assert.match(
      readFileSync(join(root, 'packages/preset/agent-presets/presets/standard/agent.cordis.yml'), 'utf8'),
      /id: command-goal[\s\S]*disabled: true/,
    )
    const command = result.report.find(item => item.id === 'command-goal')
    assert.equal(command?.surfaces.every(entry => entry.status === 'restamped'), true)
    const ui = result.report.find(item => item.id === 'ui-goal')
    assert.equal(ui?.surfaces[0]?.status, 'home-survived')
  })
})
