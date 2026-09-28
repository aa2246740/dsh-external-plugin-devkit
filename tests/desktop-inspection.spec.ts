import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runDsh } from '../src/internal/dsh.ts'

test('external desktop inspection uses public read APIs and emits identity only', () => {
  const root = mkdtempSync(join(tmpdir(), 'dshx-desktop-inspect-'))
  try {
    mkdirSync(join(root, 'apps/cli'), { recursive: true })
    writeFileSync(join(root, 'apps/cli/package.json'), '{}')
    const pkg = join(root, 'node_modules/@deepseek-ai/dsh-app-boot')
    mkdirSync(pkg, { recursive: true })
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ type: 'module', exports: './index.js' }))
    writeFileSync(join(pkg, 'index.js'), `
export const loadProfileDirectory = () => ({ skippedBundles: [], layers: [] });
export const readProfilePatches = () => [];
export const composeEntries = () => [{ id: 'demo', name: 'demo', disabled: true, config: { secret: 'never-export-this' } }];`)
    const result = runDsh(root, ['--profile', 'desktop', '--dump-config'], 5000, {})
    assert.equal(result.code, 0, result.stderr)
    assert.equal(result.stdout, '- id: demo\n  name: "demo"\n  disabled: true\n')
    assert.doesNotMatch(result.stdout, /secret|never-export/)
    for (const args of [['plugin', '--profile', 'desktop', 'add', 'demo'], ['--profile', 'desktop', '--dump-config', '--patch', 'other.yml']]) {
      assert.equal(runDsh(root, args, 5000, {}).code, 1)
    }
    assert.equal(runDsh(root, ['--profile', 'desktop', '--dump-config'], 5000, { DSH_SHELL: '1' }).code, 1)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
