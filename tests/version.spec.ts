import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { DESK_HARNESS_SHA, DESK_HARNESS_TAG, DSH_PEER_RANGE, DSHX_VERSION } from '../src/internal/types.ts'

describe('release version', () => {
  it('keeps the CLI, Guardian, package, and lockfile versions equal', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version?: string
      peerDependencies?: Record<string, string>
    }
    const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8')) as {
      version?: string
      packages?: { ''?: { version?: string } }
    }
    assert.equal(DSHX_VERSION, pkg.version)
    assert.equal(lock.version, pkg.version)
    assert.equal(lock.packages?.['']?.version, pkg.version)
    assert.equal(pkg.peerDependencies?.['@deepseek-ai/dsh'], DSH_PEER_RANGE)
    assert.equal(DESK_HARNESS_TAG, 'dsh-v0.2.1-rc.2')
    assert.equal(DESK_HARNESS_SHA, '687f282e8625c6b8d11ff58211a90524be2e4317')
  })
})
