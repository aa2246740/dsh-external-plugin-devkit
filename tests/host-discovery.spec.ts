import assert from 'node:assert/strict'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { discoverWebHosts, parseWebProcessTable } from '../src/internal/host-discovery.ts'

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
})
