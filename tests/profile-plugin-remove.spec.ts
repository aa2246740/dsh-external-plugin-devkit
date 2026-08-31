import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { removeProfilePlugin, type WebHostSnapshot } from '../src/internal/profile-plugin-remove.ts'

const roots: string[] = []

function temporary(label: string): string {
  const path = mkdtempSync(join(tmpdir(), label))
  roots.push(path)
  return path
}

function setupProfile(home: string, pluginId = 'demo'): { profile: string; patch: string; manifest: string } {
  const profile = join(home, 'profiles/web')
  mkdirSync(join(profile, 'node_modules'), { recursive: true })
  const patch = join(profile, 'cordis.patch.yml')
  const manifest = join(profile, 'package.json')
  writeFileSync(patch, '- insert:\n    - id: other\n      name: other\n')
  writeFileSync(manifest, JSON.stringify({
    dependencies: { [pluginId]: 'link:/source' },
    dsh: { profile: { bundles: [pluginId] } },
  }, null, 2))
  return { profile, patch, manifest }
}

function snapshot(pid: number, entryPresent: boolean, startedAtMs = Date.now() - 60_000): WebHostSnapshot {
  return { pid, entryPresent, startedAtMs }
}

afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('safe profile bundle removal', () => {
  it('disables the live bundle first, proves same-PID absence, then removes profile state and preserves source', async () => {
    const root = temporary('dshx-bundle-root-')
    const home = temporary('dshx-bundle-home-')
    const source = temporary('dshx-bundle-source-')
    const { profile, patch, manifest } = setupProfile(home)
    const harnessLink = join(root, 'my-plugins/demo')
    const profileLink = join(profile, 'node_modules/demo')
    mkdirSync(join(root, 'my-plugins'), { recursive: true })
    symlinkSync(source, harnessLink, 'dir')
    symlinkSync(source, profileLink, 'dir')
    writeFileSync(manifest, JSON.stringify({
      dependencies: { demo: `link:${source}` },
      dsh: { profile: { bundles: ['demo'] } },
    }, null, 2))
    const events: string[] = []

    const result = await removeProfilePlugin(root, 'demo', 43127, 2_000, {
      dshHome: home,
      async inspectHost() {
        const disabled = /id:\s*["']?demo["']?[\s\S]*disabled:\s*true/.test(readFileSync(patch, 'utf8'))
        return snapshot(1234, !disabled)
      },
      async waitForClientAbsent() {
        events.push('host-absent')
        assert.match(readFileSync(patch, 'utf8'), /dshx bundle-remove/)
        assert.equal(existsSync(profileLink), true)
        return true
      },
      removeProfileDependency() {
        events.push('profile-remove')
        const current = JSON.parse(readFileSync(manifest, 'utf8'))
        delete current.dependencies.demo
        current.dsh.profile.bundles = []
        writeFileSync(manifest, JSON.stringify(current, null, 2))
        return { code: 0, stdout: '', stderr: '' }
      },
    })

    assert.deepEqual(events, ['host-absent', 'profile-remove'])
    assert.equal(result.hostPid, 1234)
    assert.equal(result.hostTreeInactive, true)
    assert.equal(result.profileDependencyAction, 'removed')
    assert.equal(result.profileBundleAction, 'removed-by-profile-manager')
    assert.equal(result.profileEntryAction, 'detached-orphan-symlink')
    assert.equal(result.disableAction, 'retained-until-next-boot')
    assert.equal(result.cleanupPending, true)
    assert.equal(result.sourcePreserved, true)
    assert.equal(existsSync(profileLink), false)
    assert.equal(existsSync(harnessLink), false)
    assert.equal(existsSync(source), true)
  })

  it('cleans a legacy disabled scar only when the current Host started after profile removal', async () => {
    const root = temporary('dshx-bundle-clean-root-')
    const home = temporary('dshx-bundle-clean-home-')
    const { patch, manifest } = setupProfile(home, 'dsh-ade')
    writeFileSync(manifest, JSON.stringify({ dependencies: {}, dsh: { profile: { bundles: [] } } }, null, 2))
    writeFileSync(patch, '- insert:\n    - id: other\n      name: other\n- id: "dsh-ade"\n  disabled: true\n')
    let officialRemovalRan = false
    let absenceChecks = 0

    const result = await removeProfilePlugin(root, 'dsh-ade', 43127, 2_000, {
      dshHome: home,
      async inspectHost() { return snapshot(83512, false, Date.now() + 60_000) },
      async waitForClientAbsent() { absenceChecks += 1; return true },
      removeProfileDependency() {
        officialRemovalRan = true
        return { code: 1, stdout: '', stderr: 'must not run' }
      },
    })

    assert.equal(officialRemovalRan, false)
    assert.equal(absenceChecks, 1)
    assert.equal(result.disableAction, 'removed-after-cold-boot')
    assert.equal(result.cleanupPending, false)
    assert.doesNotMatch(readFileSync(patch, 'utf8'), /dsh-ade/)
  })

  it('retains the disabled scar while the Host predates persistent profile removal', async () => {
    const root = temporary('dshx-bundle-retain-root-')
    const home = temporary('dshx-bundle-retain-home-')
    const { patch, manifest } = setupProfile(home)
    writeFileSync(manifest, JSON.stringify({ dependencies: {}, dsh: { profile: { bundles: [] } } }, null, 2))
    writeFileSync(patch, '- id: "demo"\n  disabled: true\n')

    const result = await removeProfilePlugin(root, 'demo', 43127, 2_000, {
      dshHome: home,
      async inspectHost() { return snapshot(44544, false, Date.now() - 60_000) },
    })

    assert.equal(result.disableAction, 'retained-until-next-boot')
    assert.equal(result.cleanupPending, true)
    assert.match(readFileSync(patch, 'utf8'), /disabled:\s*true/)
  })

  it('does not run official removal when live graph absence is unproved', async () => {
    const root = temporary('dshx-bundle-absence-root-')
    const home = temporary('dshx-bundle-absence-home-')
    const { patch, manifest } = setupProfile(home)
    let officialRemovalRan = false

    await assert.rejects(
      removeProfilePlugin(root, 'demo', 43127, 1, {
        dshHome: home,
        async inspectHost() { return snapshot(1234, true) },
        async waitForClientAbsent() { return false },
        removeProfileDependency() {
          officialRemovalRan = true
          return { code: 0, stdout: '', stderr: '' }
        },
      }),
      /HOST_TREE_INACTIVE was not proved/,
    )
    assert.equal(officialRemovalRan, false)
    assert.match(readFileSync(patch, 'utf8'), /disabled:\s*true/)
    assert.match(readFileSync(manifest, 'utf8'), /demo/)
  })

  it('refuses to guess a bundle client id when the package name is not in the live graph', async () => {
    const root = temporary('dshx-bundle-id-root-')
    const home = temporary('dshx-bundle-id-home-')
    const { manifest } = setupProfile(home)
    let officialRemovalRan = false

    await assert.rejects(
      removeProfilePlugin(root, 'demo', 43127, 2_000, {
        dshHome: home,
        async inspectHost() { return snapshot(1234, false) },
        removeProfileDependency() {
          officialRemovalRan = true
          return { code: 0, stdout: '', stderr: '' }
        },
      }),
      /refusing to guess this bundle's client-row mapping/,
    )
    assert.equal(officialRemovalRan, false)
    assert.match(readFileSync(manifest, 'utf8'), /demo/)
  })

  it('fails closed on a PID change before package removal', async () => {
    const root = temporary('dshx-bundle-pid-root-')
    const home = temporary('dshx-bundle-pid-home-')
    const { patch, manifest } = setupProfile(home)
    let inspections = 0
    let officialRemovalRan = false

    await assert.rejects(
      removeProfilePlugin(root, 'demo', 43127, 2_000, {
        dshHome: home,
        async inspectHost() {
          inspections += 1
          return snapshot(inspections === 1 ? 1234 : 5678, inspections === 1)
        },
        async waitForClientAbsent() { return true },
        removeProfileDependency() {
          officialRemovalRan = true
          return { code: 0, stdout: '', stderr: '' }
        },
      }),
      /PID changed from 1234 to 5678/,
    )
    assert.equal(officialRemovalRan, false)
    assert.match(readFileSync(patch, 'utf8'), /disabled:\s*true/)
    assert.match(readFileSync(manifest, 'utf8'), /demo/)
  })
})
