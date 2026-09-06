import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { describe, it } from 'node:test'
import { writeText } from '../src/internal/io.ts'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wrapper = join(packageRoot, 'skill/dshx/scripts/dshx.sh')

function fakeHarness(parent: string, name: string, dshxRoot?: string): string {
  const root = join(parent, name)
  writeText(join(root, 'apps/cli/src/bin.ts'), 'export {}\n')
  if (dshxRoot === undefined) writeText(join(root, 'tools/dshx/src/cli.ts'), 'export {}\n')
  else {
    mkdirSync(join(root, 'tools'), { recursive: true })
    symlinkSync(dshxRoot, join(root, 'tools/dshx'), 'dir')
    symlinkSync(join(dshxRoot, 'node_modules'), join(root, 'node_modules'), 'dir')
  }
  return root
}

describe('portable dshx wrapper', () => {
  it('lets explicit --harness override conflicting discovery sources', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dshx-wrapper-'))
    const cwdRoot = fakeHarness(tmp, 'cwd')
    const envRoot = fakeHarness(tmp, 'env')
    const configRoot = fakeHarness(tmp, 'config')
    const explicitRoot = fakeHarness(tmp, 'explicit', packageRoot)
    const xdg = join(tmp, 'xdg')
    writeText(join(xdg, 'dshx/harness'), `${configRoot}\n`)

    const result = spawnSync('bash', [wrapper, 'which', '--harness', explicitRoot, '--json'], {
      cwd: cwdRoot,
      encoding: 'utf8',
      env: { ...process.env, DSHX_HARNESS: envRoot, XDG_CONFIG_HOME: xdg },
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.ok(result.stdout.includes(explicitRoot), result.stdout)
  })

  it('fails closed when env and cwd point at different checkouts', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dshx-wrapper-'))
    const cwdRoot = fakeHarness(tmp, 'cwd')
    const envRoot = fakeHarness(tmp, 'env')
    const result = spawnSync('bash', [wrapper, 'which'], {
      cwd: cwdRoot,
      encoding: 'utf8',
      env: { ...process.env, DSHX_HARNESS: envRoot, XDG_CONFIG_HOME: join(tmp, 'empty-xdg') },
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /conflicting Harness checkouts/)
    assert.match(result.stderr, /pass --harness/)
  })
})
