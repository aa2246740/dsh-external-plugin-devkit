import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { catalogBundle, lintBundle, runRetrievalFixtures, searchBundle } from '../src/internal/okf.ts'

describe('OKF retrieval', () => {
  it('ranks retry and timeout onto the shredded contracts', () => {
    const retry = searchBundle('retry')
    assert.equal(retry[0]?.doc.id, 'contracts/llm-retry')
    const timeout = searchBundle('timeout')
    assert.equal(timeout[0]?.doc.id, 'contracts/llm-timeout')
    assert.ok(timeout.some(hit => hit.doc.id === 'playbooks/verify-boot'))
    assert.ok((timeout[0]?.score ?? 0) > (timeout.find(hit => hit.doc.id === 'playbooks/verify-boot')?.score ?? 0))
  })

  it('hits session and creator symptoms', () => {
    const ids = (query: string) => searchBundle(query).map(hit => hit.doc.id)
    assert.ok(ids('orphan tool_call').includes('pitfalls/orphan-tool-call'))
    assert.ok(ids('400').includes('pitfalls/orphan-tool-call'))
    assert.ok(ids('Creator Mode').includes('contracts/creator-mode'))
    assert.ok(ids('session scar').includes('pitfalls/orphan-tool-call'))
  })

  it('exposes a frontmatter catalog without requiring body reads by the agent', () => {
    const catalog = catalogBundle()
    assert.ok(catalog.some(entry => entry.id === 'contracts/llm-retry' && entry.aliases.includes('retry')))
    assert.ok(catalog.every(entry => entry.id && (entry.type || entry.id.startsWith('maps/'))))
  })

  it('resolves directory cats to index.md', async () => {
    const { readDoc } = await import('../src/internal/okf.ts')
    const doc = readDoc('community')
    assert.equal(doc?.id, 'community/index')
  })

  it('ranks the round-5 holes onto the new concepts', () => {
    const ids = (query: string) => searchBundle(query).map(hit => hit.doc.id)
    assert.equal(ids('headless')[0], 'playbooks/headless-boot')
    assert.equal(ids('no-ui')[0], 'playbooks/headless-boot')
    assert.equal(ids('default export')[0], 'contracts/plugin-forms')
    assert.equal(ids('check')[0], 'playbooks/check-plugin')
    assert.equal(ids('check fail')[0], 'playbooks/check-plugin')
    assert.ok(ids('already supervising').includes('playbooks/restart-outside'))
    assert.equal(ids('stop')[0], 'playbooks/restart-outside')
    assert.equal(ids('doctor')[0], 'computations/doctor-profile')
    assert.equal(ids('--keep')[0], 'playbooks/verify-boot')
    assert.ok(ids('3091').includes('references/dshx-cli'))
    assert.ok(ids('busy port').includes('references/dshx-cli'))
    assert.equal(ids('--force')[0], 'references/dshx-cli')
    assert.ok(ids('--force').includes('playbooks/init-plugin'))
    assert.ok(ids('port-3080').includes('references/dshx-cli'))
    assert.ok(ids('host-supervised').includes('references/dshx-cli'))
    assert.equal(ids('Already up to date')[0], 'pitfalls/file-copy-stale')
    assert.equal(ids('dshx ship')[0], 'playbooks/ship-plugin')
    assert.ok(ids('DSHX_HARNESS').includes('playbooks/setup-workshop'))
    assert.equal(ids('settings.plugin.item')[0], 'contracts/settings-card')
    assert.ok(ids('PTC mode').includes('contracts/creator-mode'))
  })

  it('retrieves the lifecycle contract before restart-oriented advice', () => {
    const ids = (query: string) => searchBundle(query).map(hit => hit.doc.id)
    assert.equal(ids('hot reload')[0], 'contracts/live-activation')
    assert.equal(ids('热重载')[0], 'contracts/live-activation')
    assert.equal(ids('热插拔')[0], 'contracts/live-activation')
    assert.ok(ids('HMR').includes('contracts/live-activation'))
    assert.ok(ids('不重启').includes('contracts/live-activation'))
    assert.equal(ids('插件装了没生效')[0], 'pitfalls/installed-is-not-live')
    assert.ok(ids('client reload').includes('pitfalls/new-client-entry-needs-page-reload'))
  })

  it('keeps retrieval fixtures green', () => {
    const retrieval = runRetrievalFixtures()
    assert.deepEqual(retrieval.errors, [])
    const lint = lintBundle()
    assert.equal(lint.ok, true, lint.errors.join('\n'))
  })
})
