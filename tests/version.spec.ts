import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { DSHX_VERSION } from '../src/internal/types.ts'

describe('release version', () => {
  it('keeps the CLI, Guardian, package, and lockfile versions equal', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: string }
    const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8')) as {
      version?: string
      packages?: { ''?: { version?: string } }
    }
    assert.equal(DSHX_VERSION, pkg.version)
    assert.equal(lock.version, pkg.version)
    assert.equal(lock.packages?.['']?.version, pkg.version)
  })
})
