import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { it } from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

it('runs the npm CLI under node_modules without an external TypeScript preload', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dshx-npm-bin-'))
  try {
    const installed = join(tmp, 'node_modules', manifest.name)
    mkdirSync(installed, { recursive: true })
    for (const name of ['bin', 'src', 'package.json']) {
      cpSync(join(root, name), join(installed, name), { recursive: true })
    }
    symlinkSync(join(root, 'node_modules'), join(installed, 'node_modules'), 'dir')
    const env = { ...process.env, NODE_OPTIONS: '', DSH_HOME: join(tmp, 'home') }
    const entry = join(installed, manifest.bin.dshx)
    const version = spawnSync(process.execPath, [entry, '--version'], { cwd: tmp, env, encoding: 'utf8' })
    assert.equal(version.status, 0, version.stderr || version.stdout)
    assert.equal(version.stdout.trim(), `dshx ${manifest.version}`)
    const help = spawnSync(process.execPath, [entry, '--help'], { cwd: tmp, env, encoding: 'utf8' })
    assert.equal(help.status, 0, help.stderr || help.stdout)
    assert.match(help.stdout, /activation-plan/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
