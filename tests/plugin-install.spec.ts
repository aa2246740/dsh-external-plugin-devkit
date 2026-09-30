import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { installationHost, installLocalBundle, localBundle, pluginManagerRemote } from '../src/internal/plugin-install.ts'
import type { DiscoveredWebHost, HostDiscovery } from '../src/internal/host-discovery.ts'
import { dshManagedShellAllows, parseCli } from '../src/internal/io.ts'

const host: DiscoveredWebHost = { pid: 123, parentPid: 122, profile: 'desktop', port: 19387,
  launcher: 'desktop', home: 'same', root: 'other', processStartedAt: 'test birth identity' }

function fixture(t: TestContext) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dshx-local-install-')))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const source = join(dir, 'plugin'), home = join(dir, 'home'), profile = join(home, 'profiles/desktop')
  mkdirSync(source, { recursive: true }); mkdirSync(join(profile, 'node_modules'), { recursive: true })
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'local-example', version: '0.1.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  writeFileSync(join(source, 'cordis.patch.yml'), '- insert: []\n')
  writeFileSync(join(profile, 'package.json'), '{}')
  const methods: string[] = []
  const remote = async (method: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    methods.push(method)
    if (method === 'inspect') {
      assert.equal(args.spec, `link:${source}`)
      return { status: 'accepted', name: 'local-example', version: '0.1.0', bundle: true }
    }
    if (method === 'installBundle') {
      assert.equal(args.spec, `link:${source}`)
      assert.equal((args.options as { enabled: boolean }).enabled, true)
      writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'local-example': `link:${source}` }, dsh: { profile: { bundles: ['local-example'] } } }))
      symlinkSync(source, join(profile, 'node_modules/local-example'))
      return { application: 'applied', bundle: 'local-example', packageResult: { exitCode: 0 } }
    }
    if (method === 'listBundles') return [{ name: 'local-example', enabled: true }]
    throw new Error(`unexpected method ${method}`)
  }
  const discover = (): HostDiscovery => ({ complete: true, hosts: [host] })
  return { dir, source, home, profile, remote, methods, discover }
}

test('installs a local Desktop bundle through the public Remote and proves its exact profile link', async t => {
  const f = fixture(t)
  const result = await installLocalBundle(f.dir, f.source, 'desktop', 19387, 1000, f)
  assert.equal(result.hostPid, 123)
  assert.equal(result.hostRestart, false)
  assert.equal(result.clientVerificationRequired, true)
  assert.deepEqual(f.methods, ['inspect', 'installBundle', 'listBundles'])
})

test('plain watched plugins receive a route error without an npm publication requirement', t => {
  const f = fixture(t)
  writeFileSync(join(f.source, 'package.json'), JSON.stringify({ name: 'local-example', version: '0.1.0' }))
  assert.throws(() => localBundle(f.source), /LOCAL_BUNDLE_REQUIRED/)
})

test('new install command remains inaccessible to a DSH managed shell', () => {
  assert.equal(dshManagedShellAllows('plugin', { DSH_SHELL: '1' }, ['add', '/plugin']), false)
  const parsed = parseCli(['plugin', 'add', '/plugin', '--profile', 'desktop', '--port', '19387', '--dry-run'])
  assert.equal(parsed.options.dryRun, true)
  assert.equal(parsed.options.profile, 'desktop')
})

test('unknown, duplicate or wrong-profile Hosts never authorize a mutation', () => {
  assert.throws(() => installationHost({ complete: false, hosts: [] }, 'desktop', 19387), /IDENTITY_UNPROVEN/)
  assert.throws(() => installationHost({ complete: true, hosts: [{ ...host, home: 'unknown' }] }, 'desktop', 19387), /IDENTITY_UNPROVEN/)
  assert.throws(() => installationHost({ complete: true, hosts: [host, { ...host, pid: 234 }] }, 'desktop', 19387), /SINGLE_HOME_HOST_REQUIRED/)
  assert.throws(() => installationHost({ complete: true, hosts: [host] }, 'web', 19387), /HOST_TARGET_MISMATCH/)
})

test('already installed packages and changed local identity stop before installation', async t => {
  const f = fixture(t)
  for (const inspection of [{ status: 'refused', problem: 'already-installed' }, { status: 'accepted', name: 'other', version: '0.1.0', bundle: true }]) {
    let calls = 0
    await assert.rejects(installLocalBundle(f.dir, f.source, 'desktop', 19387, 1000, { ...f, remote: async method => {
      calls++; assert.equal(method, 'inspect'); return inspection
    } }), /PLUGIN_INSPECTION_REFUSED/)
    assert.equal(calls, 1)
  }
})

test('PID reuse between inspection and installation is rejected without writing profile state', async t => {
  const f = fixture(t)
  let count = 0
  await assert.rejects(installLocalBundle(f.dir, f.source, 'desktop', 19387, 1000, { ...f,
    discover: () => ({ complete: true, hosts: [{ ...host, processStartedAt: count++ ? 'new birth identity' : host.processStartedAt }] }),
  }), /HOST_CHANGED_DURING_INSTALL/)
  assert.deepEqual(f.methods, ['inspect'])
  assert.equal(readFileSync(join(f.profile, 'package.json'), 'utf8'), '{}')
})

test('changing the local package identity during inspection cannot install a different package', async t => {
  const f = fixture(t)
  await assert.rejects(installLocalBundle(f.dir, f.source, 'desktop', 19387, 1000, { ...f, remote: async (method, args) => {
    const result = await f.remote(method, args)
    writeFileSync(join(f.source, 'package.json'), JSON.stringify({ name: 'changed', version: '0.1.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    return result
  } }), /LOCAL_PACKAGE_CHANGED/)
  assert.deepEqual(f.methods, ['inspect'])
})

test('manager failures, pending build scripts and restart-required remain unfinished outcomes', async t => {
  const f = fixture(t)
  for (const application of ['failed', 'cancelled', 'restart-required', 'overridden']) {
    await assert.rejects(installLocalBundle(f.dir, f.source, 'desktop', 19387, 1000, { ...f, remote: async (method, args) => {
      if (method === 'inspect') return f.remote(method, args)
      assert.equal(method, 'installBundle')
      return { application, error: { code: 'test-refusal' }, pendingBuilds: ['unapproved-script'] }
    } }), /PLUGIN_INSTALL_.*pending scripts: unapproved-script/)
  }
  assert.equal(readFileSync(join(f.profile, 'package.json'), 'utf8'), '{}')
})

test('a lost install response joins the same request without issuing another install', async t => {
  const f = fixture(t)
  const methods: string[] = []
  let requestId: unknown
  const result = await installLocalBundle(f.dir, f.source, 'desktop', 19387, 1000, { ...f, remote: async (method, args) => {
    methods.push(method)
    if (method === 'installBundle') { requestId = (args!.options as { requestId: string }).requestId; await f.remote(method, args); throw new Error('response lost') }
    if (method === 'waitForInstall') { assert.equal(args?.requestId, requestId); return { application: 'applied' } }
    return f.remote(method, args)
  } })
  assert.equal(result.application, 'applied')
  assert.deepEqual(methods, ['inspect', 'installBundle', 'waitForInstall', 'listBundles'])
})

test('an unknown settlement cannot be reported as success or automatically retried', async t => {
  const f = fixture(t)
  let installs = 0
  await assert.rejects(installLocalBundle(f.dir, f.source, 'desktop', 19387, 1000, { ...f, remote: async (method, args) => {
    if (method === 'inspect') return f.remote(method, args)
    if (method === 'installBundle') { installs++; throw new Error('timeout') }
    assert.equal(method, 'waitForInstall'); return null
  } }), /INSTALL_OUTCOME_UNCONFIRMED/)
  assert.equal(installs, 1)
})

test('an applied answer without the exact local profile link is not installation proof', async t => {
  const f = fixture(t)
  await assert.rejects(installLocalBundle(f.dir, f.source, 'desktop', 19387, 1000, { ...f, remote: async (method, args) => {
    if (method === 'inspect') return f.remote(method, args)
    return { application: 'applied' }
  } }), /PROFILE_INSTALL_UNPROVEN/)
})

test('public RPC uses the official envelope and rejects mismatched correlation and extra methods', async () => {
  const observed: string[] = []
  const rpc = pluginManagerRemote(19387, 1000, async (url, init) => {
    const body = JSON.parse(init!.body as string)
    observed.push(String(url))
    assert.equal(body.type, 'client-request')
    assert.deepEqual(body.payload, { args: { spec: 'link:/plugin' } })
    return new Response(JSON.stringify({ type: 'server-response', rpcId: body.rpcId, result: { ok: true, value: { status: 'accepted' } } }))
  })
  assert.deepEqual(await rpc('inspect', { spec: 'link:/plugin' }), { status: 'accepted' })
  assert.deepEqual(observed, ['http://127.0.0.1:19387/api/pluginManager/inspect'])
  await assert.rejects(rpc('arbitraryMethod'), /METHOD_NOT_ALLOWED/)
  const wrong = pluginManagerRemote(19387, 1000, async () => new Response(JSON.stringify({ type: 'server-response', rpcId: 'wrong', result: { ok: true } })))
  await assert.rejects(wrong('inspect'), /INVALID_RESPONSE/)
})
