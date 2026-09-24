import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { resolvePluginDir } from '../src/internal/plugin.ts'

function writeProfile(home: string, name: string, dependencies: Record<string, string>): void {
  const dir = join(home, 'profiles', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `dsh-profile-${name}`, dependencies }))
}

function writeSource(dir: string, name?: string): void {
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'src', `${name ?? 'plugin'}.ts`), 'export function apply() {}\n')
  if (name) writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }))
}

const savedHome = process.env.DSH_HOME
afterEach(() => {
  if (savedHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedHome
})

describe('resolvePluginDir profile link/file fallback', () => {
  it('resolves a plugin linked into a profile by dependency name', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-harness-'))
    const home = mkdtempSync(join(tmpdir(), 'dshx-home-'))
    const source = join(home, 'elsewhere', 'plugin-work-tree')
    writeSource(source)
    writeProfile(home, 'web', { 'some-plugin': `link:${source}` })
    process.env.DSH_HOME = home
    assert.equal(resolvePluginDir(root, 'some-plugin'), realpathSync(source))
  })

  it('resolves by the target package name when the dependency name differs', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-harness-'))
    const home = mkdtempSync(join(tmpdir(), 'dshx-home-'))
    const source = join(home, 'scratch', 'my-working-copy')
    writeSource(source, 'better-display')
    writeProfile(home, 'web', { 'better-display': `link:${source}` })
    process.env.DSH_HOME = home
    assert.equal(resolvePluginDir(root, 'better-display'), realpathSync(source))
  })

  it('resolves by the target directory basename', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-harness-'))
    const home = mkdtempSync(join(tmpdir(), 'dshx-home-'))
    const source = join(home, 'scratch', 'watcher-015')
    writeSource(source, 'dsh-watcher')
    writeProfile(home, 'web', { 'dsh-watcher': `file:${source}` })
    process.env.DSH_HOME = home
    assert.equal(resolvePluginDir(root, 'watcher-015'), realpathSync(source))
  })

  it('dedupes the same source linked under several profiles', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-harness-'))
    const home = mkdtempSync(join(tmpdir(), 'dshx-home-'))
    const source = join(home, 'scratch', 'shared-plugin')
    writeSource(source)
    writeProfile(home, 'web', { 'shared-plugin': `link:${source}` })
    writeProfile(home, 'headless', { 'shared-plugin': `link:${source}` })
    process.env.DSH_HOME = home
    assert.equal(resolvePluginDir(root, 'shared-plugin'), realpathSync(source))
  })

  it('refuses to guess between different linked sources', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-harness-'))
    const home = mkdtempSync(join(tmpdir(), 'dshx-home-'))
    const first = join(home, 'a', 'plugin-copy')
    const second = join(home, 'b', 'plugin-copy')
    writeSource(first, 'forked')
    writeSource(second, 'forked')
    writeProfile(home, 'web', { 'forked': `link:${first}` })
    writeProfile(home, 'headless', { 'forked': `link:${second}` })
    process.env.DSH_HOME = home
    assert.throws(() => resolvePluginDir(root, 'forked'), /several profile-linked sources/)
  })

  it('still reports the profile fallback when nothing matches', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-harness-'))
    const home = mkdtempSync(join(tmpdir(), 'dshx-home-'))
    writeProfile(home, 'web', { unrelated: 'link:/nonexistent' })
    process.env.DSH_HOME = home
    assert.throws(() => resolvePluginDir(root, 'ghost'), /profile link\/file dependencies/)
  })

  it('skips a profile with a malformed package.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-harness-'))
    const home = mkdtempSync(join(tmpdir(), 'dshx-home-'))
    const source = join(home, 'scratch', 'survivor')
    writeSource(source)
    writeProfile(home, 'web', { survivor: `link:${source}` })
    mkdirSync(join(home, 'profiles', 'broken'), { recursive: true })
    writeFileSync(join(home, 'profiles', 'broken', 'package.json'), '{ "name": broken')
    process.env.DSH_HOME = home
    assert.equal(resolvePluginDir(root, 'survivor'), realpathSync(source))
    assert.throws(() => resolvePluginDir(root, 'ghost'), /profile link\/file dependencies/)
  })

  it('keeps my-plugins entries ahead of profile links', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-harness-'))
    const home = mkdtempSync(join(tmpdir(), 'dshx-home-'))
    const mine = join(root, 'my-plugins', 'dup')
    const linked = join(home, 'scratch', 'dup-copy')
    writeSource(mine)
    writeSource(linked)
    writeProfile(home, 'web', { dup: `link:${linked}` })
    process.env.DSH_HOME = home
    assert.equal(realpathSync(resolvePluginDir(root, 'dup')), realpathSync(mine))
  })
})
