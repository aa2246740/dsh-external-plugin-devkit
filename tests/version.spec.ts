import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { DSHX_VERSION } from '../src/internal/types.ts'

describe('release version', () => {
  it('keeps the CLI and Guardian version equal to package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: string }
    assert.equal(DSHX_VERSION, pkg.version)
  })
})
