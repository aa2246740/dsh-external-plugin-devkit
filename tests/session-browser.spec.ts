import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { configureSessionBrowserAdapter, assertCreatorBrowserHost, sessionBrowserAdapter, openBrowserAdapter } from '../src/internal/browser-access.ts'
import { dshManagedShellAllows } from '../src/internal/io.ts'

test('session handoff executes only its externally pinned adapter snapshot', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dshx-session-browser-'))
  const host = { home, root: home, pid: 123, processStartedAt: 'test-boot', port: 43127 }
  const source = join(home, 'adapter.mjs')
  const adapter = `#!/usr/bin/env node\nlet raw='';for await (const c of process.stdin) raw+=c; const input=JSON.parse(raw);if (process.argv.length !== 2 || process.env.DSHX_WEB_STARTUP_URL) process.exit(3);process.stdout.write(JSON.stringify({status:'BROWSER_AUTHENTICATED',origin:input.origin}));`
  try {
    writeFileSync(source, adapter, { mode: 0o700 })
    assert.throws(() => sessionBrowserAdapter(host, 'owner'), /BROWSER_ADAPTER_REQUIRED/)
    const configured = configureSessionBrowserAdapter(host, 'owner', source)
    assert.equal(configured.status, 'BROWSER_ADAPTER_CONFIGURED')
    const snapshot = sessionBrowserAdapter(host, 'owner')
    assert.notEqual(snapshot, source)
    assert.equal(readFileSync(snapshot, 'utf8'), adapter)
    writeFileSync(source, '#!/usr/bin/env node\nprocess.exit(9)')
    assert.equal(sessionBrowserAdapter(host, 'owner'), snapshot)
    const receipt = await openBrowserAdapter(snapshot, host, 'http://127.0.0.1:43127/?token=synthetic-test-value', 3000)
    assert.deepEqual(receipt, { status: 'BROWSER_AUTHENTICATED', origin: 'http://127.0.0.1:43127' })
    assert.throws(() => sessionBrowserAdapter(host, 'another-session'), /BROWSER_ADAPTER_REQUIRED/)
    assert.throws(() => sessionBrowserAdapter({ ...host, root: '/different-root' }, 'owner'), /BROWSER_ADAPTER_INVALID/)
    writeFileSync(snapshot, 'changed')
    assert.throws(() => sessionBrowserAdapter(host, 'owner'), /BROWSER_ADAPTER_CHANGED/)
    chmodSync(source, 0o777)
    assert.throws(() => configureSessionBrowserAdapter(host, 'owner', source), /BROWSER_ADAPTER_INVALID/)
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('new setup does not widen the DSH managed shell', () => {
  for (const args of [['configure','owner','/tmp/adapter'], ['open'], ['bind']]) {
    assert.equal(dshManagedShellAllows('browser', { DSH_SHELL:'1' }, args), false)
  }
})


test('fixed entry rejects a foreign Host, port, or forged child context', () => {
  const host = { home: '/home', root: '/root', pid: 12, processStartedAt: 'boot', port: 43127 }
  assert.doesNotThrow(() => assertCreatorBrowserHost(host, { hostPid: 12, hostPort: 43127 }, 12))
  assert.throws(() => assertCreatorBrowserHost(host, { hostPid: 12, hostPort: 43127 }, 99), /WEB_HOST_CHANGED/)
  assert.throws(() => assertCreatorBrowserHost(host, { hostPid: 13, hostPort: 43127 }, 12), /WEB_HOST_CHANGED/)
  assert.throws(() => assertCreatorBrowserHost(host, { hostPid: 12, hostPort: 1234 }, 12), /WEB_HOST_CHANGED/)
})
