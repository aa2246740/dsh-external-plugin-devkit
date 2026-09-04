import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { collectUpdatePlan, latestReleaseRef, parseReleaseRef } from '../src/internal/update.ts'
import { candidateVerified, candidateWebGateFailures } from '../src/internal/update-candidate.ts'
import type { CandidateWebGateResult, UpdateCandidateState } from '../src/internal/update-candidate.ts'

function git(root: string, args: readonly string[]): void {
  execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' })
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

function fakeHarness(): string {
  const root = mkdtempSync(join(tmpdir(), 'dshx-update-'))
  write(join(root, 'apps/cli/src/bin.ts'), 'export {}\n')
  write(join(root, 'tools/dshx/src/cli.ts'), 'export {}\n')
  write(join(root, 'package.json'), '{"version":"0.1.0-rc.8"}\n')
  write(join(root, 'my-plugins/local/src/index.ts'), "export function apply() { console.log('[local] loaded') }\n")
  write(join(root, 'my-plugins/local/dshx.yml'), 'id: local\nentry: src/index.ts\nmarker: "[local] loaded"\n')
  write(join(root, 'my-plugins/local/package.json'), '{"name":"local","version":"1.0.0","scripts":{"build":"tsc"}}\n')
  const external = join(root, 'external-plugin')
  write(join(external, 'src/index.ts'), "export function apply() { console.log('[linked] loaded') }\n")
  write(join(external, 'dshx.yml'), 'id: linked\nentry: src/index.ts\nmarker: "[linked] loaded"\n')
  symlinkSync(external, join(root, 'my-plugins/linked'))
  git(root, ['init'])
  git(root, ['config', 'user.email', 'dshx@example.invalid'])
  git(root, ['config', 'user.name', 'DSHX Test'])
  git(root, ['remote', 'add', 'origin', 'https://github.com/deepseek-ai/deepseek-harness.git'])
  git(root, ['add', 'apps', 'package.json'])
  git(root, ['commit', '-m', 'rc8'])
  git(root, ['tag', 'dsh-v0.1.0-rc.8'])
  git(root, ['tag', 'dsh-v0.1.1-rc.2'])
  return root
}

describe('update plan', () => {
  it('orders prerelease tags numerically', () => {
    const latest = latestReleaseRef([
      'a\trefs/tags/dsh-v0.1.1-rc.2',
      'b\trefs/tags/dsh-v0.1.1-rc.10',
      'c\trefs/tags/dsh-v0.1.0-rc.8',
    ].join('\n'))
    assert.equal(latest?.tag, 'dsh-v0.1.1-rc.10')
    assert.equal(parseReleaseRef('not-a-release', 'x'), undefined)
  })

  it('inventories directories and symlinks without mutating a clean checkout', () => {
    const root = fakeHarness()
    const before = execFileSync('git', ['-C', root, 'status', '--porcelain=v1'], { encoding: 'utf8' })
    const plan = collectUpdatePlan(root, 'dsh-v0.1.1-rc.2')
    const after = execFileSync('git', ['-C', root, 'status', '--porcelain=v1'], { encoding: 'utf8' })
    assert.equal(plan.checkout.version, '0.1.0-rc.8')
    assert.equal(plan.target.version, '0.1.1-rc.2')
    assert.deepEqual(plan.plugins.map(plugin => plugin.name), ['linked', 'local'])
    assert.equal(plan.plugins.find(plugin => plugin.name === 'linked')?.location, 'symlink')
    assert.equal(plan.checkout.trackedChanges.length, 0)
    assert.equal(before, after)
  })

  it('blocks a blind update when tracked Harness files are dirty', () => {
    const root = fakeHarness()
    writeFileSync(join(root, 'package.json'), '{"version":"dirty"}\n')
    const plan = collectUpdatePlan(root, 'dsh-v0.1.1-rc.2')
    assert.equal(plan.checkout.trackedChanges.includes('package.json'), true)
    assert.equal(plan.blockers.some(blocker => blocker.includes('tracked Harness changes')), true)
  })

  it('requires both Web gates in addition to every plugin before apply is eligible', () => {
    const gate = (name: CandidateWebGateResult['gate']): CandidateWebGateResult => ({
      gate: name,
      staticConfig: true,
      runtime: true,
      expectedClientPackages: [],
      graphEntries: 1,
      servedBundles: 0,
      logFile: '/tmp/dshx-test.log',
    })
    const state: UpdateCandidateState = {
      schemaVersion: 1,
      preparedAt: '2026-09-04T00:00:00.000Z',
      verifiedAt: '2026-09-04T00:00:01.000Z',
      sourceRoot: '/tmp/source',
      sourceSha: 'source',
      target: { tag: 'dsh-v0.1.2-rc.1', sha: 'target', version: '0.1.2-rc.1', local: true },
      candidateRoot: '/tmp/candidate',
      harnessInstall: true,
      harnessBuild: true,
      installLog: '/tmp/install.log',
      buildLog: '/tmp/build.log',
      plugins: [{
        name: 'client',
        sourcePath: '/tmp/source/my-plugins/client',
        stagedPath: '/tmp/candidate/my-plugins/client',
        sourceLocation: 'directory',
        client: true,
        sourceHash: 'hash',
        copied: true,
        build: true,
        buildRequired: true,
        staticCheck: true,
        runtime: true,
        runtimeProof: 'web-client-graph',
      }],
      vanillaWeb: gate('vanilla-web'),
      combinedWeb: gate('combined-web'),
    }
    assert.equal(candidateVerified(state), true)
    const incomplete: UpdateCandidateState = {
      ...state,
      combinedWeb: { ...state.combinedWeb!, runtime: false },
    }
    assert.equal(candidateVerified(incomplete), false)
    assert.deepEqual(candidateWebGateFailures(incomplete), ['combined-web'])
  })
})
