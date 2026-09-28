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
    assert.equal(DESK_HARNESS_TAG, 'dsh-v0.1.7-rc.2')
    assert.equal(DESK_HARNESS_SHA, '477b4f420553e8a52c2fbccc464d7561b239c443')
  })
})
