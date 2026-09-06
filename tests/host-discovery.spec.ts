import assert from 'node:assert/strict'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { assertNoAffectedWebHosts, discoverWebHosts, parseWebProcessTable } from '../src/internal/host-discovery.ts'

const root = '/work/deepseek-harness'
const source = join(root, 'apps/cli/src/bin.ts')

describe('Web Host discovery', () => {
  it('finds App-shell and direct CLI Web Hosts without assuming one port', () => {
    const rows = parseWebProcessTable([
      `101 1 /opt/node --import tsx/esm ${source} web --port 43127 --no-open`,
      `202 1 /opt/node --import tsx/esm ${source} web --no-open --port 3099`,
      '303 1 /opt/node worker.js --port 43127',
    ].join('\n'), root)
    assert.deepEqual(rows.map(row => ({ pid: row.pid, port: row.port, launcher: row.launcher })), [
      { pid: 101, port: 43127, launcher: 'source' },
      { pid: 202, port: 3099, launcher: 'source' },
    ])
  })

  it('recognizes a published dsh web launcher and its default port', () => {
    const rows = parseWebProcessTable([
      '404 1 /usr/local/bin/dsh web --no-open',
      '405 1 /opt/node /usr/local/bin/dsh web --port=43127',
      `406 1 /opt/node ${join(root, 'apps/cli/lib/bin.js')} web --port 3900`,
      '407 1 /opt/node apps/cli/src/bin.ts web --port 3901',
      '408 1 /opt/node /another/checkout/apps/cli/src/bin.ts web --port 3902',
    ].join('\n'), root)
    assert.deepEqual(rows.map(row => ({ pid: row.pid, port: row.port, launcher: row.launcher })), [
      { pid: 404, port: 3080, launcher: 'binary' },
      { pid: 405, port: 43127, launcher: 'binary' },
      { pid: 406, port: 3900, launcher: 'binary' },
      { pid: 407, port: 3901, launcher: 'source' },
      { pid: 408, port: 3902, launcher: 'source' },
    ])
  })

  it('does not mistake a shell command mentioning dsh web for the Host process', () => {
    const rows = parseWebProcessTable(`500 1 /bin/zsh -lc node ${source} web --port 43127`, root)
    assert.deepEqual(rows, [])
  })

  it('classifies same-home, other-home, and inaccessible candidates separately', () => {
    const home = '/Users/test/.dsh'
    const table = [
      `101 1 /opt/node ${source} web --port 43127`,
      `202 1 /opt/node ${source} web --port 3099`,
      `303 1 /usr/local/bin/dsh web --port 8080`,
    ].join('\n')
    const result = discoverWebHosts(root, home, {
      processTable: () => ({ ok: true, text: table }),
      openFiles: pid => pid === 101
        ? { ok: true, paths: [`${home}/profiles/web/cordis.yml`] }
        : pid === 202
          ? { ok: true, paths: ['/tmp/isolated/profiles/web/package.json'] }
          : { ok: false, paths: [] },
      processStart: pid => ({ ok: true, text: `start-${pid}` }),
    })
    assert.equal(result.complete, true)
    assert.deepEqual(result.hosts.map(host => ({ pid: host.pid, home: host.home })), [
      { pid: 101, home: 'same' },
      { pid: 202, home: 'other' },
      { pid: 303, home: 'unknown' },
    ])
  })

  it('reports process-table denial as unknown instead of proving no Host', () => {
    const result = discoverWebHosts(root, '/Users/test/.dsh', {
      processTable: () => ({ ok: false, text: '', reason: 'process table unavailable (EPERM)' }),
    })
    assert.equal(result.complete, false)
    assert.match(result.reason ?? '', /EPERM/)
  })

  it('blocks update mutations for same-Home, same-root, and unproved Web Hosts', () => {
    const home = '/Users/test/.dsh'
    const cases = [
      { command: `/other/apps/cli/src/bin.ts web --port 4001`, files: [`${home}/profiles/web/package.json`] },
      { command: `${source} web --port 4002`, files: ['/other-home/profiles/web/package.json'] },
      { command: '/usr/local/bin/dsh web --port 4003', files: [] },
    ]
    for (const [index, value] of cases.entries()) {
      assert.throws(() => assertNoAffectedWebHosts(root, home, 'update apply', {
        processTable: () => ({ ok: true, text: `${700 + index} 1 /opt/node ${value.command}` }),
        openFiles: () => ({ ok: true, paths: value.files }),
        processStart: pid => ({ ok: true, text: `start-${pid}` }),
      }), /refusing update apply: affected or unproved live Web Host/)
    }
  })

  it('allows a proved Web Host only when both its Home and Harness root differ', () => {
    const result = assertNoAffectedWebHosts(root, '/Users/test/.dsh', 'update rollback', {
      processTable: () => ({ ok: true, text: '800 1 /opt/node /other/apps/cli/src/bin.ts web --port 4004' }),
      openFiles: () => ({ ok: true, paths: ['/other-home/profiles/web/package.json'] }),
      processStart: () => ({ ok: true, text: 'start-800' }),
    })
    assert.equal(result.hosts[0]?.home, 'other')
    assert.equal(result.hosts[0]?.root, 'other')
  })
})
