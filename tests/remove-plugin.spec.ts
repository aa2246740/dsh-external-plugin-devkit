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
import {
  claimCreatorPlugin,
  creatorQuarantine,
  quarantineClaimedPlugin,
  type CreatorContext,
} from '../src/internal/creator.ts'
import { removeCreatorPlugin } from '../src/internal/remove-plugin.ts'

const roots: string[] = []

function temporary(label: string): string {
  const path = mkdtempSync(join(tmpdir(), label))
  roots.push(path)
  return path
}

function context(workspaceRoot: string): CreatorContext {
  return {
    sessionId: 'session-remove',
    callId: 'call-remove',
    rootCallId: 'root-remove',
    hostPid: 1234,
    hostParentPid: 1233,
    hostPort: 43127,
    bridgeVersion: 2,
    workspaceRoot,
  }
}

afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('Creator+ safe plugin removal', () => {
  it('deactivates the Host row before profile cleanup, detaches only symlinks, and preserves source', async () => {
    const root = temporary('dshx-remove-root-')
    const home = temporary('dshx-remove-home-')
    const workspace = temporary('dshx-remove-workspace-')
    const source = join(workspace, 'demo')
    const harnessLink = join(root, 'my-plugins/demo')
    const profile = join(home, 'profiles/web')
    const profileLink = join(profile, 'node_modules/demo')
    const patch = join(profile, 'cordis.patch.yml')
    mkdirSync(source, { recursive: true })
    mkdirSync(join(root, 'my-plugins'), { recursive: true })
    mkdirSync(join(profile, 'node_modules'), { recursive: true })
    writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'demo' }))
    symlinkSync(source, harnessLink, 'dir')
    symlinkSync(source, profileLink, 'dir')
    writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { demo: `link:${source}` } }, null, 2))
    writeFileSync(patch, '- insert:\n    - id: "demo"\n      name: "demo"\n')
    const creator = context(workspace)
    claimCreatorPlugin(root, 'demo', creator)
    const events: string[] = []

    const result = await removeCreatorPlugin(root, 'demo', creator, 2_000, {
      dshHome: home,
      async waitForClientAbsent() {
        events.push('host-absent')
        assert.doesNotMatch(readFileSync(patch, 'utf8'), /id:\s*["']?demo/)
        assert.equal(existsSync(source), true)
        assert.equal(existsSync(profileLink), true)
        return true
      },
      removeProfileDependency() {
        events.push('profile-remove')
        const manifestPath = join(profile, 'package.json')
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        delete manifest.dependencies.demo
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
        return { code: 0, stdout: '', stderr: '' }
      },
    })

    assert.deepEqual(events, ['host-absent', 'profile-remove'])
    assert.equal(result.hostTreeInactive, true)
    assert.equal(result.patchAction, 'removed')
    assert.equal(result.profileDependencyAction, 'removed')
    assert.equal(result.profileEntryAction, 'detached-orphan-symlink')
    assert.equal(result.harnessLinkAction, 'detached')
    assert.equal(result.sourcePreserved, true)
    assert.equal(existsSync(profileLink), false)
    assert.equal(existsSync(harnessLink), false)
    assert.equal(existsSync(source), true)
  })

  it('resumes a failed official removal from its durable quarantine and clears only the orphan links', async () => {
    const root = temporary('dshx-remove-resume-root-')
    const home = temporary('dshx-remove-resume-home-')
    const workspace = temporary('dshx-remove-resume-workspace-')
    const source = join(workspace, 'demo')
    const harnessLink = join(root, 'my-plugins/demo')
    const profile = join(home, 'profiles/web')
    const profileLink = join(profile, 'node_modules/demo')
    const patch = join(profile, 'cordis.patch.yml')
    mkdirSync(source, { recursive: true })
    mkdirSync(join(root, 'my-plugins'), { recursive: true })
    mkdirSync(join(profile, 'node_modules'), { recursive: true })
    symlinkSync(source, harnessLink, 'dir')
    symlinkSync(harnessLink, profileLink, 'dir')
    writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: {} }))
    writeFileSync(patch, '- insert:\n    - id: demo\n      name: demo\n')
    const creator = context(workspace)
    const claim = claimCreatorPlugin(root, 'demo', creator)
    const quarantined = quarantineClaimedPlugin(
      root,
      claim,
      patch,
      creator.hostPid,
      creator.hostPort,
      'simulated prior partial removal',
    )
    assert.equal(quarantined?.quarantine.mode, 'removed')
    assert.equal(creatorQuarantine(root, 'demo')?.mode, 'removed')

    let officialRemovalRan = false
    const result = await removeCreatorPlugin(root, 'demo', creator, 2_000, {
      dshHome: home,
      async waitForClientAbsent() { return true },
      removeProfileDependency() {
        officialRemovalRan = true
        return { code: 1, stdout: '', stderr: 'must not run for an already-absent dependency' }
      },
    })

    assert.equal(officialRemovalRan, false)
    assert.equal(result.patchAction, 'removed')
    assert.equal(result.profileDependencyAction, 'already-absent')
    assert.equal(result.profileEntryAction, 'detached-orphan-symlink')
    assert.equal(existsSync(profileLink), false)
    assert.equal(existsSync(harnessLink), false)
    assert.equal(existsSync(source), true)
    assert.equal(creatorQuarantine(root, 'demo'), undefined)
  })

  it('refuses to unlink an unexpected profile target after the official remover returns success', async () => {
    const root = temporary('dshx-remove-target-root-')
    const home = temporary('dshx-remove-target-home-')
    const workspace = temporary('dshx-remove-target-workspace-')
    const source = join(workspace, 'demo')
    const unrelated = join(workspace, 'unrelated')
    const harnessLink = join(root, 'my-plugins/demo')
    const profile = join(home, 'profiles/web')
    const profileLink = join(profile, 'node_modules/demo')
    const patch = join(profile, 'cordis.patch.yml')
    mkdirSync(source, { recursive: true })
    mkdirSync(unrelated, { recursive: true })
    mkdirSync(join(root, 'my-plugins'), { recursive: true })
    mkdirSync(join(profile, 'node_modules'), { recursive: true })
    symlinkSync(source, harnessLink, 'dir')
    symlinkSync(unrelated, profileLink, 'dir')
    writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { demo: `link:${source}` } }))
    writeFileSync(patch, '- insert:\n    - id: demo\n      name: demo\n')
    const creator = context(workspace)
    claimCreatorPlugin(root, 'demo', creator)

    await assert.rejects(
      removeCreatorPlugin(root, 'demo', creator, 2_000, {
        dshHome: home,
        async waitForClientAbsent() { return true },
        removeProfileDependency() {
          writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: {} }))
          return { code: 0, stdout: '', stderr: '' }
        },
      }),
      /pointing outside the claimed plugin paths/,
    )
    assert.equal(existsSync(profileLink), true)
    assert.equal(existsSync(harnessLink), true)
    assert.equal(existsSync(source), true)
  })

  it('fails closed after patch quarantine when same-Host absence cannot be proved', async () => {
    const root = temporary('dshx-remove-fail-root-')
    const home = temporary('dshx-remove-fail-home-')
    const workspace = temporary('dshx-remove-fail-workspace-')
    const profile = join(home, 'profiles/web')
    const patch = join(profile, 'cordis.patch.yml')
    mkdirSync(profile, { recursive: true })
    writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { demo: 'link:/missing' } }))
    writeFileSync(patch, '- insert:\n    - id: demo\n      name: demo\n')
    const creator = context(workspace)
    claimCreatorPlugin(root, 'demo', creator)
    let profileRemovalRan = false

    await assert.rejects(
      removeCreatorPlugin(root, 'demo', creator, 1, {
        dshHome: home,
        async waitForClientAbsent() { return false },
        removeProfileDependency() {
          profileRemovalRan = true
          return { code: 0, stdout: '', stderr: '' }
        },
      }),
      /HOST_TREE_INACTIVE was not proved/,
    )
    assert.equal(profileRemovalRan, false)
    assert.doesNotMatch(readFileSync(patch, 'utf8'), /id:\s*demo/)
    assert.match(readFileSync(join(profile, 'package.json'), 'utf8'), /demo/)
  })

  it('refuses to remove Creator infrastructure', async () => {
    const root = temporary('dshx-remove-protected-root-')
    const workspace = temporary('dshx-remove-protected-workspace-')
    const creator = context(workspace)
    claimCreatorPlugin(root, 'dsh-creator-mode-plus', creator)
    await assert.rejects(
      removeCreatorPlugin(root, 'dsh-creator-mode-plus', creator, 1),
      /Creator infrastructure/,
    )
  })

  it('hands a profile dependency without a watched client row to the external supervisor', async () => {
    const root = temporary('dshx-remove-manifest-root-')
    const home = temporary('dshx-remove-manifest-home-')
    const workspace = temporary('dshx-remove-manifest-workspace-')
    const profile = join(home, 'profiles/web')
    mkdirSync(join(profile, 'node_modules/server-plugin'), { recursive: true })
    writeFileSync(join(profile, 'node_modules/server-plugin/package.json'), JSON.stringify({ name: 'server-plugin' }))
    writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'server-plugin': 'link:/server-plugin' } }))
    const creator = context(workspace)
    claimCreatorPlugin(root, 'server-plugin', creator)

    await assert.rejects(
      removeCreatorPlugin(root, 'server-plugin', creator, 1, { dshHome: home }),
      /no bounded watched-client row.*external supervisor/,
    )
    assert.match(readFileSync(join(profile, 'package.json'), 'utf8'), /server-plugin/)
  })
})
