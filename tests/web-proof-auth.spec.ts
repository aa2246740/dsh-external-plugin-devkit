import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { verifyClientInHostManifest, waitForClientAbsent } from '../src/internal/new-client.ts'
import { createWebProofRequest } from '../src/internal/web-proof-auth.ts'

test('proof credentials cannot target a different origin', async () => {
  assert.throws(() => createWebProofRequest(43127, 'http://127.0.0.1:3080/?token=secret'), /WEB_AUTH_ORIGIN_MISMATCH/)
  const request = createWebProofRequest(43127, '')
  await assert.rejects(request('https://example.com/client.js'), /WEB_AUTH_ORIGIN_MISMATCH/)
})

test('RC1 authenticated activation and absence proof keep credentials private', async () => {
  let present = true
  const server = createServer((req, res) => {
    if (req.url === '/?token=test-secret') {
      res.writeHead(303, { location: '/', 'set-cookie': 'proof=session-secret; HttpOnly; Path=/' }).end()
    } else if (req.headers.cookie !== 'proof=session-secret') res.writeHead(401).end()
    else if (req.url === '/client.js') res.end('window.__ModuleLoader__.load({})')
    else res.end(`<script>globalThis["__DSH_BOOT__"] = ${JSON.stringify({ entries: present ? [{ id: 'demo', url: '/client.js' }] : [] })}</script>`)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const previous = process.env.DSHX_WEB_STARTUP_URL
  try {
    process.env.DSHX_WEB_STARTUP_URL = `http://127.0.0.1:${port}/?token=test-secret`
    const proof = await verifyClientInHostManifest('demo', port, 1500)
    assert.equal(proof.id, 'demo')
    assert.doesNotMatch(JSON.stringify(proof), /test-secret|session-secret/)
    present = false
    assert.equal(await waitForClientAbsent('demo', port, 1500), true)
    delete process.env.DSHX_WEB_STARTUP_URL
    const start = Date.now()
    await assert.rejects(verifyClientInHostManifest('demo', port, 5000), /WEB_AUTH_REQUIRED/)
    assert.ok(Date.now() - start < 1000, '401 must fail immediately, not become timeout')
  } finally {
    if (previous === undefined) delete process.env.DSHX_WEB_STARTUP_URL
    else process.env.DSHX_WEB_STARTUP_URL = previous
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
