import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { applyPluginSourceOverrides, collectUpdatePlan, latestReleaseRef, parseReleaseRef } from '../src/internal/update.ts'
import { candidateVerified, candidateWebGateFailures, combinedPluginNames } from '../src/internal/update-candidate.ts'
import { assertNoStagingOnlyPluginSources } from '../src/internal/update-apply.ts'
import type { CandidatePluginResult, CandidateWebGateResult, UpdateCandidateState } from '../src/internal/update-candidate.ts'

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

function isolatedEnv(root: string): NodeJS.ProcessEnv {
  return { ...process.env, DSH_HOME: join(root, '.test-dsh-home') }
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
    const plan = collectUpdatePlan(root, 'dsh-v0.1.1-rc.2', isolatedEnv(root))
    const after = execFileSync('git', ['-C', root, 'status', '--porcelain=v1'], { encoding: 'utf8' })
    assert.equal(plan.checkout.version, '0.1.0-rc.8')
    assert.equal(plan.target.version, '0.1.1-rc.2')
    assert.deepEqual(plan.plugins.map(plugin => plugin.name), ['linked', 'local'])
    assert.equal(plan.plugins.find(plugin => plugin.name === 'linked')?.location, 'symlink')
    assert.equal(plan.plugins.every(plugin => plugin.activeInProfile === false), true)
    assert.equal(plan.checkout.trackedChanges.length, 0)
    assert.equal(before, after)
  })

  it('blocks a blind update when tracked Harness files are dirty', () => {
    const root = fakeHarness()
    writeFileSync(join(root, 'package.json'), '{"version":"dirty"}\n')
    const plan = collectUpdatePlan(root, 'dsh-v0.1.1-rc.2', isolatedEnv(root))
    assert.equal(plan.checkout.trackedChanges.includes('package.json'), true)
    assert.equal(plan.blockers.some(blocker => blocker.includes('tracked Harness changes')), true)
  })

  it('includes local Web-profile plugins that are absent from my-plugins', () => {
    const root = fakeHarness()
    const home = join(root, '.test-dsh-home')
    const profile = join(home, 'profiles/web')
    const source = join(root, 'profile-only')
    write(join(source, 'src/index.ts'), "export function apply() { console.log('[profile-only] loaded') }\n")
    write(join(source, 'dshx.yml'), 'id: profile-only\nentry: src/index.ts\nmarker: "[profile-only] loaded"\n')
    write(join(source, 'package.json'), '{"name":"profile-only","version":"1.0.0","scripts":{"build":"tsc"},"dsh":{"client":{"platform":"web"}}}\n')
    write(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'profile-only': `link:${source}` } }))
    const plan = collectUpdatePlan(root, 'dsh-v0.1.1-rc.2', isolatedEnv(root))
    assert.equal(plan.plugins.find(plugin => plugin.name === 'profile-only')?.location, 'profile-link')
    assert.equal(plan.plugins.find(plugin => plugin.name === 'profile-only')?.realPath, realpathSync(source))
    assert.equal(plan.plugins.find(plugin => plugin.name === 'profile-only')?.activeInProfile, false)
  })

  it('marks a workspace plugin active when the Web profile bundle list enables its package', () => {
    const root = fakeHarness()
    const home = join(root, '.test-dsh-home')
    const profile = join(home, 'profiles/web')
    write(join(profile, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['local'] } } }))

    const plan = collectUpdatePlan(root, 'dsh-v0.1.1-rc.2', isolatedEnv(root))
    assert.equal(plan.plugins.find(plugin => plugin.name === 'local')?.activeInProfile, true)
    assert.equal(plan.plugins.find(plugin => plugin.name === 'linked')?.activeInProfile, false)
  })

  it('marks patch-inserted plugins active and respects a later home-level disable', () => {
    const root = fakeHarness()
    const home = join(root, '.test-dsh-home')
    const profile = join(home, 'profiles/web')
    write(join(profile, 'package.json'), JSON.stringify({ dependencies: {} }))
    write(join(profile, 'cordis.patch.yml'), '- insert:\n    - id: local\n      name: local\n')

    let plan = collectUpdatePlan(root, 'dsh-v0.1.1-rc.2', isolatedEnv(root))
    assert.equal(plan.plugins.find(plugin => plugin.name === 'local')?.activeInProfile, true)

    write(join(home, 'cordis.patch.yml'), '- id: local\n  disabled: true\n')
    plan = collectUpdatePlan(root, 'dsh-v0.1.1-rc.2', isolatedEnv(root))
    assert.equal(plan.plugins.find(plugin => plugin.name === 'local')?.activeInProfile, false)
  })

  it('reports but does not stage a missing local profile dependency', () => {
    const root = fakeHarness()
    const home = join(root, '.test-dsh-home')
    const profile = join(home, 'profiles/web')
    const missing = join(root, 'missing-plugin')
    write(join(profile, 'package.json'), JSON.stringify({ dependencies: { missing: `link:${missing}` } }))
    const plan = collectUpdatePlan(root, 'dsh-v0.1.1-rc.2', isolatedEnv(root))
    assert.equal(plan.plugins.some(plugin => plugin.name === 'missing'), false)
    assert.deepEqual(plan.staleProfileDependencies, [{ name: 'missing', spec: `link:${missing}`, source: missing }])
    assert.deepEqual(plan.blockers, [])
  })

  it('uses the active profile source when a same-name my-plugins copy is stale', () => {
    const root = fakeHarness()
    const home = join(root, '.test-dsh-home')
    const profile = join(home, 'profiles/web')
    const active = join(root, 'active-local')
    write(join(active, 'src/index.ts'), "export function apply() { console.log('[active-local] loaded') }\n")
    write(join(active, 'dshx.yml'), 'id: local\nentry: src/index.ts\nmarker: "[active-local] loaded"\n')
    write(join(active, 'package.json'), '{"name":"local","version":"2.0.0","scripts":{"build":"tsc"}}\n')
    write(join(profile, 'package.json'), JSON.stringify({ dependencies: { local: `link:${active}` } }))
    const plan = collectUpdatePlan(root, 'dsh-v0.1.1-rc.2', isolatedEnv(root))
    assert.equal(plan.plugins.filter(plugin => plugin.name === 'local').length, 1)
    assert.equal(plan.plugins.find(plugin => plugin.name === 'local')?.location, 'profile-link')
    assert.equal(plan.plugins.find(plugin => plugin.name === 'local')?.version, '2.0.0')
  })

  it('uses an active profile source over a differently named workspace copy with the same plugin id', () => {
    const root = fakeHarness()
    const home = join(root, '.test-dsh-home')
    const profile = join(home, 'profiles/web')
    const stale = join(root, 'my-plugins', 'dsh-cuadrive-mac')
    const active = join(root, 'active-cua-drive')
    write(join(stale, 'src/index.ts'), 'export function apply() {}\n')
    write(join(stale, 'dshx.yml'), 'id: dsh-cuadrive-mac\nentry: src/index.ts\n')
    write(join(stale, 'package.json'), '{"name":"dsh-cuadrive-mac"}\n')
    write(join(active, 'src/index.ts'), 'export function apply() {}\n')
    write(join(active, 'dshx.yml'), 'id: dsh-cuadrive-mac\nentry: src/index.ts\n')
    write(join(active, 'package.json'), '{"name":"dsh-cua-drive"}\n')
    write(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'dsh-cua-drive': `link:${active}` } }))

    const plan = collectUpdatePlan(root, 'dsh-v0.1.1-rc.2', isolatedEnv(root))
    assert.equal(plan.plugins.some(plugin => plugin.name === 'dsh-cuadrive-mac'), false)
    const winner = plan.plugins.find(plugin => plugin.name === 'dsh-cua-drive')
    assert.equal(winner?.location, 'profile-link')
    assert.equal(winner?.id, 'dsh-cuadrive-mac')
    assert.equal(winner?.realPath, realpathSync(active))
    assert.equal(plan.blockers.length, 0)
  })

  it('fails closed when two active profile packages declare the same plugin id', () => {
    const root = fakeHarness()
    const home = join(root, '.test-dsh-home')
    const profile = join(home, 'profiles/web')
    const first = join(root, 'active-first')
    const second = join(root, 'active-second')
    for (const [name, source] of [['first', first], ['second', second]] as const) {
      write(join(source, 'src/index.ts'), 'export function apply() {}\n')
      write(join(source, 'dshx.yml'), 'id: duplicate-live-id\nentry: src/index.ts\n')
      write(join(source, 'package.json'), JSON.stringify({ name }))
    }
    write(join(profile, 'package.json'), JSON.stringify({ dependencies: { first: `link:${first}`, second: `link:${second}` } }))

    const plan = collectUpdatePlan(root, 'dsh-v0.1.1-rc.2', isolatedEnv(root))
    const conflicts = plan.plugins.filter(plugin => plugin.id === 'duplicate-live-id')
    assert.equal(conflicts.length, 2)
    assert.equal(conflicts.every(plugin => plugin.valid === false), true)
    assert.equal(conflicts.every(plugin => plugin.issue?.includes('multiple active candidate sources')), true)
    assert.equal(plan.blockers.some(blocker => blocker.includes('invalid local plugin sources')), true)
  })

  it('uses an explicit compatible source only for candidate staging and preserves the active source identity', () => {
    const root = fakeHarness()
    const compatible = join(root, 'compat-local')
    write(join(compatible, 'src/index.ts'), "export function apply() { console.log('[compat] loaded') }\n")
    write(join(compatible, 'dshx.yml'), 'id: local\nentry: src/index.ts\nmarker: "[compat] loaded"\n')
    write(join(compatible, 'package.json'), '{"name":"local","version":"2.0.0","scripts":{"build":"tsc"}}\n')

    const plan = collectUpdatePlan(root, 'dsh-v0.1.1-rc.2', isolatedEnv(root), [`local=${compatible}`])
    const selected = plan.plugins.find(plugin => plugin.name === 'local')
    assert.equal(selected?.location, 'source-override')
    assert.equal(selected?.realPath, realpathSync(compatible))
    assert.equal(selected?.activeSourcePath, realpathSync(join(root, 'my-plugins/local')))
    assert.equal(selected?.sourceOverride, realpathSync(compatible))
    assert.equal(selected?.activeInProfile, false)
    assert.equal(readFileSync(join(root, 'my-plugins/local/src/index.ts'), 'utf8').includes('[compat]'), false)
  })

  it('combines only active-profile plugins while keeping old state conservative', () => {
    const plugins = [
      { name: 'active', activeInProfile: true },
      { name: 'dormant', activeInProfile: false },
      { name: 'legacy-state' },
    ] as CandidatePluginResult[]
    assert.deepEqual(combinedPluginNames(plugins), ['active', 'legacy-state'])
  })

  it('rejects an explicit compatible source that changes a plugin id', () => {
    const root = fakeHarness()
    const incompatible = join(root, 'incompatible-local')
    write(join(incompatible, 'src/index.ts'), 'export function apply() {}\n')
    write(join(incompatible, 'dshx.yml'), 'id: not-local\nentry: src/index.ts\n')
    write(join(incompatible, 'package.json'), '{"name":"local"}\n')
    const base = collectUpdatePlan(root, 'dsh-v0.1.1-rc.2', isolatedEnv(root)).plugins
    assert.throws(() => applyPluginSourceOverrides(root, base, [`local=${incompatible}`]), /id mismatch/)
  })

  it('keeps a candidate-only source override out of update apply', () => {
    const state = {
      plugins: [{ name: 'gateway', sourceOverride: '/tmp/gateway-rc1' }],
    } as UpdateCandidateState
    assert.throws(() => assertNoStagingOnlyPluginSources(state), /staging-only plugin source override\(s\): gateway/)
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
