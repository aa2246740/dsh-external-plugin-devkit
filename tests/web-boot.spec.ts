import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { describe, it } from 'node:test'
import { fetchAuthenticatedWebPage, fetchAuthenticatedWebResource, findWebStartupUrl, parseWebBootManifest } from '../src/internal/web-boot.ts'

describe('authenticated Web boot', () => {
  it('finds the official local startup URL only for the requested port', () => {
    const log = 'dsh web: http://127.0.0.1:43160/?token=one\n'
    assert.equal(findWebStartupUrl(log, 43160)?.searchParams.get('token'), 'one')
    assert.equal(findWebStartupUrl(log, 43161), undefined)
  })

  it('parses RC1 globalThis boot assignments without executing HTML', () => {
    const html = '<script>globalThis["__DSH_BOOT__"] = {"entries":[{"id":"demo","url":"/plugins/demo/client.js?rev=1"}]}</script>'
    assert.deepEqual(parseWebBootManifest(html), { entries: [{ id: 'demo', url: '/plugins/demo/client.js?rev=1' }] })
    assert.equal(parseWebBootManifest('<script>window.__DSH_BOOT__ = {}</script>'), undefined)
  })

  it('exchanges the launcher token for a cookie before reading the boot graph and bundle', async () => {
    const server = createServer((request, response) => {
      if (request.url === '/?token=fixture') {
        response.writeHead(303, { location: '/', 'set-cookie': 'dsh_session=fixture; HttpOnly; Path=/' })
        response.end()
        return
      }
      if (request.headers.cookie !== 'dsh_session=fixture') {
        response.writeHead(401)
        response.end('unauthorized')
        return
      }
      if (request.url === '/') {
        response.writeHead(200, { 'content-type': 'text/html' })
        response.end('<script>globalThis["__DSH_BOOT__"] = {"entries":[{"id":"demo","url":"/plugins/demo/client.js?rev=1"}]}</script>')
        return
      }
      response.writeHead(200, { 'content-type': 'text/javascript' })
      response.end('window.__ModuleLoader__.load({ id: "demo", factory() {} })')
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('expected TCP address')
    try {
      const page = await fetchAuthenticatedWebPage(new URL(`http://127.0.0.1:${address.port}/?token=fixture`))
      assert.equal(parseWebBootManifest(page.html)?.entries[0]?.id, 'demo')
      const bundle = await fetchAuthenticatedWebResource(page, '/plugins/demo/client.js?rev=1')
      assert.equal(bundle.status, 200)
      assert.match(await bundle.text(), /ModuleLoader/)
    } finally {
      server.close()
      await once(server, 'close')
    }
  })
})
