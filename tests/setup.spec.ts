import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { parseCli } from '../src/internal/io.ts'
import { writeText } from '../src/internal/io.ts'
import { cmdSetup } from '../src/commands/setup.ts'
import { SETUP_PROMPT_EN, SETUP_PROMPT_ZH } from '../src/internal/setup-prompt.ts'

function captureSetup(argv: string[]): { code: number; stdout: string } {
  const parsed = parseCli(argv)
  let stdout = ''
  const write = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString()
    return true
  }) as typeof process.stdout.write
  try {
    const code = cmdSetup(parsed.args, parsed.options)
    return { code, stdout }
  } finally {
    process.stdout.write = write
  }
}

describe('setup', () => {
  it('prints both language prompts without needing a harness', () => {
    const { code, stdout } = captureSetup(['setup', '--print-prompt'])
    assert.equal(code, 0)
    assert.match(stdout, /dsh-external-plugin-devkit/)
    assert.ok(stdout.includes('不要启动或杀掉'))
    assert.ok(SETUP_PROMPT_ZH.includes('不要启动或杀掉'))
    assert.ok(SETUP_PROMPT_EN.includes('Do not start or kill'))
  })

  it('dry-run on a bare checkout does not clone', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dshx-setup-'))
    writeText(join(tmp, 'apps/cli/src/bin.ts'), 'export {}\n')
    writeText(join(tmp, 'package.json'), `${JSON.stringify({ name: 'h', scripts: {} }, null, 2)}\n`)
    const packageBefore = readFileSync(join(tmp, 'package.json'), 'utf8')
    const prev = process.env.DSHX_HARNESS
    const prevXdg = process.env.XDG_CONFIG_HOME
    delete process.env.DSHX_HARNESS
    process.env.XDG_CONFIG_HOME = join(tmp, 'xdg')
    try {
      const { code, stdout } = captureSetup(['setup', '--dry-run', '--harness', tmp])
      assert.equal(code, 0, stdout)
      assert.match(stdout, /would git clone/)
      assert.match(stdout, /would install user launcher/)
      assert.match(stdout, /package\.json remains unchanged/)
      assert.equal(readFileSync(join(tmp, 'package.json'), 'utf8'), packageBefore)
    } finally {
      if (prev === undefined) delete process.env.DSHX_HARNESS
      else process.env.DSHX_HARNESS = prev
      if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME
      else process.env.XDG_CONFIG_HOME = prevXdg
    }
  })
})
