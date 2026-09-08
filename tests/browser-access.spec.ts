import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertSameBrowserHost, bindBrowserAccess, openBrowserAdapter, readBrowserBinding, writeBrowserBinding, type BrowserHostIdentity } from '../src/internal/browser-access.ts'
import { createWebProofRequest } from '../src/internal/web-proof-auth.ts'
import { fetchAuthenticatedWebPage, fetchAuthenticatedWebResource } from '../src/internal/web-boot.ts'
import { dshManagedShellAllows, parseCli } from '../src/internal/io.ts'

const boot = '<script>globalThis["__DSH_BOOT__"] = {"entries":[]}</script>'
async function fixture(run: (port: number, exchanges: () => number) => Promise<void>) {
  let exchanges = 0
  const server = createServer((req, res) => {
    if (req.url === '/?token=private-test-token') {
      exchanges++
      setTimeout(() => res.writeHead(303, { location: '/', 'set-cookie': 'dsh-auth-test=session; Path=/; HttpOnly; SameSite=Strict' }).end(), 20)
    } else if (req.headers.cookie !== 'dsh-auth-test=session') res.writeHead(401).end()
    else if (req.url === '/redirect') res.writeHead(302, { location: 'http://example.com/' }).end()
    else res.end(boot)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try { await run((server.address() as { port: number }).port, () => exchanges) }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
}

test('concurrent proofs exchange once; an aborted waiter does not cancel another', async () => fixture(async (port, exchanges) => {
  const request = createWebProofRequest(port, `http://127.0.0.1:${port}/?token=private-test-token`)
  const controller = new AbortController()
  const cancelled = request('/', { signal: controller.signal })
  const cancellation = assert.rejects(cancelled, /abort/i)
  const requests = [request('/'), request('/')]
  setTimeout(() => controller.abort(), 10)
  for (const response of await Promise.all(requests)) assert.equal(await response.text(), boot)
  await cancellation
  assert.equal(exchanges(), 1)
  await assert.rejects(request('/redirect'), /WEB_AUTH_ORIGIN_MISMATCH/)
}))

test('private binding revalidates boot, expires, and cannot follow symlinks', async () => fixture(async port => {
  const home = mkdtempSync(join(tmpdir(), 'dshx-browser-binding-'))
  const host: BrowserHostIdentity = { home, root: home, pid: 41, processStartedAt: 'boot-1', port }
  const startup = `http://127.0.0.1:${port}/?token=private-test-token`
  try {
    const bound = await bindBrowserAccess(home, startup, 'creator', 1000, () => host)
    assert.doesNotMatch(JSON.stringify(bound), /private-test-token|startupUrl/)
    assert.equal(readBrowserBinding(host)?.startupUrl, startup)
    assert.equal(statSync(join(home, '.dshx-browser/access.json')).mode & 0o777, 0o600)
    assert.equal(statSync(join(home, '.dshx-browser')).mode & 0o777, 0o700)
    assert.throws(() => readBrowserBinding({ ...host, processStartedAt: 'boot-2' }), /WEB_HOST_CHANGED/)
    assert.throws(() => readBrowserBinding(host, bound.expiresAt), /WEB_HANDOFF_EXPIRED/)
    for (const changed of [{ ...host, pid: 42 }, { ...host, port: port + 1 }, { ...host, home: '/other' }, { ...host, root: '/other' }]) {
      assert.throws(() => assertSameBrowserHost(host, changed), /WEB_HOST_CHANGED/)
    }
    let checks = 0
    await assert.rejects(bindBrowserAccess(home, startup, 'creator', 1000, () => ++checks === 1 ? host : { ...host, pid: 42 }), /WEB_HOST_CHANGED/)
    assert.equal(readBrowserBinding(host)?.host.pid, 41)
    chmodSync(join(home, '.dshx-browser/access.json'), 0o644)
    assert.throws(() => readBrowserBinding(host), /WEB_HANDOFF_PERMISSIONS/)
    rmSync(join(home, '.dshx-browser/access.json'))
    const outside = join(home, 'outside'); writeFileSync(outside, 'untouched', { mode: 0o600 })
    symlinkSync(outside, join(home, '.dshx-browser/access.json'))
    assert.throws(() => writeBrowserBinding({ version: 1, host, source: 'creator', expiresAt: Date.now() + 1000, startupUrl: startup }), /WEB_HANDOFF_PERMISSIONS/)
    assert.equal(readFileSync(outside, 'utf8'), 'untouched')
  } finally { rmSync(home, { recursive: true, force: true }) }
}))

test('verifier does not forward a cookie to foreign redirects or bundle URLs', async () => {
  let calls = 0
  const request = (async () => { calls++; return new Response('', { status: 303, headers: { location: 'https://example.com/', 'set-cookie': 'secret=cookie' } }) }) as typeof fetch
  const url = new URL('http://127.0.0.1:3080/?token=secret')
  await assert.rejects(fetchAuthenticatedWebPage(url, request), /WEB_AUTH_ORIGIN_MISMATCH/)
  assert.equal(calls, 1)
  await assert.rejects(fetchAuthenticatedWebResource({ url, cookie: 'secret=cookie', html: '' }, 'https://example.com/evil.js', request), /WEB_AUTH_ORIGIN_MISMATCH/)
  assert.equal(calls, 1)
})

test('browser adapter receives credentials only on stdin and output is whitelisted', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dshx-browser-adapter-'))
  const executable = join(root, 'adapter.mjs')
  const host = { home: root, root, pid: 41, processStartedAt: 'boot-1', port: 3080 }
  try {
    writeFileSync(executable, `#!/usr/bin/env node\nlet data='';for await(const chunk of process.stdin)data+=chunk;const input=JSON.parse(data);if(process.argv.length!==2||process.env.DSHX_WEB_STARTUP_URL)process.exit(1);process.stderr.write(input.startupUrl);process.stdout.write(JSON.stringify({status:'BROWSER_AUTHENTICATED',origin:input.origin,secret:input.startupUrl}));`, { mode: 0o700 })
    const result = await openBrowserAdapter(executable, host, 'http://127.0.0.1:3080/?token=private-test-token', 3000)
    assert.deepEqual(result, { status: 'BROWSER_AUTHENTICATED', origin: 'http://127.0.0.1:3080' })
    await assert.rejects(openBrowserAdapter(undefined, host, undefined, 1000), /BROWSER_ADAPTER_REQUIRED/)
    writeFileSync(executable, '#!/usr/bin/env node\nsetInterval(()=>{},1000)', { mode: 0o700 })
    await assert.rejects(openBrowserAdapter(executable, host, undefined, 50), /BROWSER_ADAPTER_TIMEOUT/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('browser commands keep managed shells read-only and do not accept credential flags', () => {
  assert.equal(dshManagedShellAllows('browser', { DSH_SHELL: '1' }, ['status']), true)
  for (const action of ['open', 'bind']) assert.equal(dshManagedShellAllows('browser', { DSH_SHELL: '1' }, [action]), false)
  assert.equal(parseCli(['browser', 'open', '--timeout', '5']).options.timeoutMs, 5000)
  assert.throws(() => parseCli(['browser', 'open', '--port', '43127']), /browser accepts/)
})
