import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { acquireCreatorActivationLock } from '../src/internal/creator.ts'
import { hotReloadJournalPath } from '../src/internal/hot-reload-journal.ts'
import { hotReloadPlugin, type HotReloadDependencies } from '../src/internal/hot-reload.ts'
import { creatorActivationLockPath } from '../src/internal/paths.ts'
import type { HostState } from '../src/internal/types.ts'

const UUID = '12345678-1234-4234-8234-123456789abc'
const iso = '2026-09-06T00:00:00.000Z'

function fixture(activeGlobalHmr = false) {
  const base = mkdtempSync(join(tmpdir(), 'dshx-hot-reload-test-'))
  const root = join(base, 'harness')
  const home = join(base, 'home')
  const profile = join(home, 'profiles', 'web')
  const plugin = join(root, 'my-plugins', 'demo')
  const source = join(plugin, 'src', 'index.ts')
  const runtime = join(plugin, 'lib', 'index.js')
  mkdirSync(join(profile, 'node_modules'), { recursive: true })
  mkdirSync(join(plugin, 'src'), { recursive: true })
  mkdirSync(join(plugin, 'lib'), { recursive: true })
  writeFileSync(source, "export const name = 'demo'\nexport function apply() {}\n")
  writeFileSync(runtime, "export const name = 'demo-v2'\nexport function apply() {}\n")
  writeFileSync(join(plugin, 'dshx.yml'), 'id: demo\nentry: src/index.ts\nkind: function\nprofile: web\n')
  writeFileSync(join(plugin, 'package.json'), JSON.stringify({
    name: 'demo-runtime',
    type: 'module',
    main: 'lib/index.js',
    types: 'lib/index.d.ts',
    exports: {
      '.': { types: './lib/index.d.ts', default: './lib/index.js' },
      './package.json': './package.json',
    },
  }))
  symlinkSync(plugin, join(profile, 'node_modules', 'demo-runtime'))
  const patchPath = join(profile, 'cordis.patch.yml')
  writeFileSync(patchPath, [
    '- insert:',
    '    - id: demo',
    '      name: demo-runtime',
    ...activeGlobalHmr
      ? ['    - id: unsafe-hmr', '      name: "@deepseek-ai/cordis-plugin-hmr"', '      config:', '        root: ["."]']
      : [],
    '',
  ].join('\n'))
  const host: HostState = {
    pid: 4242,
    profile: 'web',
    port: 43127,
    overlay: '',
    logFile: join(base, 'host.log'),
    startedAt: iso,
    command: [],
    processStartedAt: 'birth-4242',
    home: resolve(home),
    hostRoot: resolve(root),
  }
  return {
    base,
    root,
    home,
    profile,
    plugin,
    source: realpathSync(source),
    runtime: realpathSync(runtime),
    patchPath,
    host,
  }
}

function hash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function simulatedDependencies(test: ReturnType<typeof fixture>, failAfterTouch = false): HotReloadDependencies {
  let reportPath = ''
  let transactionId = ''
  let hmrEntryId = ''
  let report: Record<string, unknown> | undefined
  let touched = 0
  let targetScope: 'root' | 'preset' = 'root'

  const publish = (phase: string, fields: Record<string, unknown> = {}) => {
    report = { ...report, ...fields, phase }
    writeFileSync(reportPath, `${JSON.stringify(report)}\n`, { mode: 0o600 })
    chmodSync(reportPath, 0o600)
  }
  const identity = () => ({
    version: 1,
    transactionId,
    pluginId: 'demo',
    hmrEntryId,
    targetScope,
    expectedPid: 4242,
    pid: 4242,
    samePid: true,
  })
  return {
    dshHome: test.home,
    currentHost: () => test.host,
    processStart: () => ({ ok: true, text: 'birth-4242' }),
    portProbe: async () => 'open',
    creatorContext: () => undefined,
    observerPath: resolve('src/runtime/hot-reload-observer.mjs'),
    uuid: () => UUID,
    sleep: async () => {},
    writePatch(path, content) {
      writeFileSync(path, content)
      const reportMatch = content.match(/reportPath: ("[^"\n]+")/)
      const hmrMatch = content.match(/hmrEntryId: ("[^"\n]+")/)
      const transactionMatch = content.match(/transactionId: ("[^"\n]+")/)
      const scopeMatch = content.match(/targetScope: ("(?:root|preset)")/)
      if (reportMatch && hmrMatch && transactionMatch && !report) {
        reportPath = JSON.parse(reportMatch[1]!)
        hmrEntryId = JSON.parse(hmrMatch[1]!)
        transactionId = JSON.parse(transactionMatch[1]!)
        targetScope = scopeMatch ? JSON.parse(scopeMatch[1]!) : 'root'
        report = identity()
        publish('READY', {
          readyAt: iso,
          targetGenerationIds: ['generation-1'],
          targetGenerationStates: [{ generationId: 'generation-1', state: 'ACTIVE' }],
          hmrGenerationId: 'generation-2',
          ...targetScope === 'preset' ? { discoveryAnchor: { disabled: true, hasFiber: false } } : {},
        })
      } else if (report && content.includes('# dshx hot-reload begin')
        && !content.includes('@deepseek-ai/cordis-plugin-hmr')) {
        publish('HMR_DISPOSED', { hmrDisposed: { at: iso, generationId: 'generation-2' } })
      } else if (report && !content.includes('# dshx hot-reload begin')) {
        publish('OBSERVER_DISPOSED', { observerDisposed: { at: iso } })
      }
    },
    touch(path, at) {
      assert.ok(path === test.source || path === test.runtime)
      utimesSync(path, at, at)
      touched += 1
      if (touched < 2) return
      writeFileSync(test.patchPath, `${readFileSync(test.patchPath, 'utf8').trimEnd()}\n# concurrent edit\n`)
      if (failAfterTouch) {
        publish('FAILED', { failure: { at: iso, code: 'OBSERVER_POLL_FAILED' } })
      } else {
        publish('MODULE_RELOADED', {
          moduleReloaded: {
            at: iso,
            oldGenerationIds: ['generation-1'],
            newGenerationIds: ['generation-3'],
            hmrEventAt: iso,
            hmrEventMatchedGenerationIds: ['generation-1'],
            samePid: true,
          },
        })
      }
    },
  }
}

describe('controlled server plugin hot reload', () => {
  it('touches the ESM-resolved package export, proves same-PID HMR, and preserves concurrent patch edits', async (t) => {
    const test = fixture()
    t.after(() => rmSync(test.base, { recursive: true, force: true }))
    const before = hash(test.runtime)

    const result = await hotReloadPlugin(test.root, 'web', 'demo', 43127, 2_000, simulatedDependencies(test))

    assert.equal(result.entryPath, test.runtime)
    assert.notEqual(result.entryPath, test.source)
    assert.deepEqual(result.watchRoots, ['src/index.ts', 'lib/index.js'])
    assert.equal(result.targetScope, 'root')
    assert.deepEqual(result.proof.artifactHashes.map(item => item.path), result.watchRoots)
    assert.ok(result.proof.artifactHashes.every(item => item.before === item.after))
    assert.equal(result.hostPid, 4242)
    assert.equal(result.hostRestart, false)
    assert.equal(result.journal.status, 'succeeded')
    assert.equal(result.journal.automaticRecovery, false)
    assert.equal(result.journal.cleanupProved, true)
    assert.equal(result.proof.moduleReloaded.moduleReloaded?.hmrEventMatchedGenerationIds[0], 'generation-1')
    assert.equal(hash(test.runtime), before)
    const finalPatch = readFileSync(test.patchPath, 'utf8')
    assert.match(finalPatch, /# concurrent edit/)
    assert.doesNotMatch(finalPatch, /dshx hot-reload begin|dshx-hot-reload-observer/)
    assert.equal(statSync(result.journal.path).mode & 0o777, 0o600)
    const journalText = readFileSync(result.journal.path, 'utf8')
    const journal = JSON.parse(journalText)
    assert.equal(journal.status, 'succeeded')
    assert.equal(journal.stage, 'succeeded')
    assert.equal(journal.host.pid, 4242)
    assert.equal(journal.target.entryPath, test.runtime)
    assert.equal(journal.target.targetScope, 'root')
    assert.deepEqual(journal.target.artifactHashes.map((item: { path: string }) => item.path), result.watchRoots)
    assert.equal(journal.evidence.moduleReloaded.hmrEventAt, iso)
    assert.deepEqual(journal.evidence.moduleReloaded.hmrEventMatchedGenerationIds, ['generation-1'])
    assert.equal(journal.evidence.moduleReloaded.samePid, true)
    assert.deepEqual(journal.evidence.moduleReloaded.artifactHashes, result.proof.artifactHashes)
    assert.equal(journal.evidence.hmrDisposed.generationId, 'generation-2')
    assert.equal(journal.evidence.observerDisposed.at, iso)
    assert.deepEqual(journal.cleanup, { marker: 'absent', hmr: 'disposed', observer: 'disposed', proved: true })
    assert.equal(journal.automaticRecovery, false)
    assert.doesNotMatch(journalText, /startupUrl|authorization|cookie|token/i)
  })

  it('fails immediately on a classified observer failure and still removes only its marker block', async (t) => {
    const test = fixture()
    t.after(() => rmSync(test.base, { recursive: true, force: true }))

    await assert.rejects(
      hotReloadPlugin(test.root, 'web', 'demo', 43127, 2_000, simulatedDependencies(test, true)),
      /hot-reload observer failed: OBSERVER_POLL_FAILED/,
    )
    const finalPatch = readFileSync(test.patchPath, 'utf8')
    assert.match(finalPatch, /# concurrent edit/)
    assert.doesNotMatch(finalPatch, /dshx hot-reload begin|dshx-hot-reload-observer/)
    const journalPath = hotReloadJournalPath(test.root, UUID)
    assert.equal(statSync(journalPath).mode & 0o777, 0o600)
    const journalText = readFileSync(journalPath, 'utf8')
    const journal = JSON.parse(journalText)
    assert.equal(journal.status, 'failed')
    assert.equal(journal.stage, 'failed')
    assert.equal(journal.host.pid, 4242)
    assert.equal(journal.target.pluginId, 'demo')
    assert.equal(journal.failure.code, 'HOT_RELOAD_FAILED')
    assert.equal(journal.failure.stage, 'waiting-module-reload')
    assert.deepEqual(journal.cleanup, { marker: 'absent', hmr: 'unknown', observer: 'unknown', proved: false })
    assert.equal(journal.automaticRecovery, false)
    assert.doesNotMatch(journalText, /startupUrl|authorization|cookie|token|OBSERVER_POLL_FAILED/i)
  })

  it('rejects an existing global HMR owner before changing the watched patch', async (t) => {
    const test = fixture(true)
    t.after(() => rmSync(test.base, { recursive: true, force: true }))
    const before = readFileSync(test.patchPath, 'utf8')

    await assert.rejects(
      hotReloadPlugin(test.root, 'web', 'demo', 43127, 2_000, simulatedDependencies(test)),
      /active global HMR row unsafe-hmr has unbounded ownership/,
    )
    assert.equal(readFileSync(test.patchPath, 'utf8'), before)
  })

  it('does not guess when package import and require exports point at different entries', async (t) => {
    const test = fixture()
    t.after(() => rmSync(test.base, { recursive: true, force: true }))
    writeFileSync(join(test.plugin, 'package.json'), JSON.stringify({
      name: 'demo-runtime',
      type: 'module',
      exports: { import: './lib/index.js', require: './lib/index.cjs' },
    }))
    writeFileSync(join(test.plugin, 'lib', 'index.cjs'), 'exports.apply = function apply() {}\n')
    const before = readFileSync(test.patchPath, 'utf8')

    await assert.rejects(
      hotReloadPlugin(test.root, 'web', 'demo', 43127, 2_000, simulatedDependencies(test)),
      /condition-dependent runtime entries/,
    )
    assert.equal(readFileSync(test.patchPath, 'utf8'), before)
  })

  it('accepts a conventional package main without a leading dot slash', async (t) => {
    const test = fixture()
    t.after(() => rmSync(test.base, { recursive: true, force: true }))
    writeFileSync(join(test.plugin, 'package.json'), JSON.stringify({
      name: 'demo-runtime',
      type: 'module',
      main: 'lib/index.js',
    }))

    const result = await hotReloadPlugin(test.root, 'web', 'demo', 43127, 2_000, simulatedDependencies(test))
    assert.equal(result.entryPath, test.runtime)
    assert.deepEqual(result.watchRoots, ['src/index.ts', 'lib/index.js'])
  })

  it('mounts an external preset discovery anchor and reports the explicit all-fibers scope', async (t) => {
    const test = fixture()
    t.after(() => rmSync(test.base, { recursive: true, force: true }))
    writeFileSync(test.patchPath, '[]\n')

    const result = await hotReloadPlugin(
      test.root, 'web', 'demo', 43127, 2_000, 'preset', simulatedDependencies(test),
    )

    assert.equal(result.targetScope, 'preset')
    assert.match(result.anchorEntryId ?? '', /^dshx-hot-reload-anchor-/)
    assert.equal(result.proof.targetScope, 'preset')
    assert.deepEqual(result.proof.ready.discoveryAnchor, { disabled: true, hasFiber: false })
    assert.deepEqual(result.watchRoots, ['src/index.ts', 'lib/index.js'])
    assert.doesNotMatch(readFileSync(test.patchPath, 'utf8'), /dshx-hot-reload-anchor/)
  })

  it('rejects preset scope whenever a CreatorContext is present', async (t) => {
    const test = fixture()
    t.after(() => rmSync(test.base, { recursive: true, force: true }))
    const dependencies = simulatedDependencies(test)
    dependencies.creatorContext = () => ({ hostPid: 4242, hostPort: 43127 } as never)

    await assert.rejects(
      hotReloadPlugin(test.root, 'web', 'demo', 43127, 2_000, 'preset', dependencies),
      /external-only and refuses CreatorContext/,
    )
  })

  it('fails closed without deleting an incomplete activation lock', (t) => {
    const test = fixture()
    t.after(() => rmSync(test.base, { recursive: true, force: true }))
    const lockPath = creatorActivationLockPath(test.root)
    mkdirSync(dirname(lockPath), { recursive: true })
    writeFileSync(lockPath, '')

    assert.throws(
      () => acquireCreatorActivationLock(test.root, 'demo'),
      /lock is (?:unreadable|incomplete); refusing to remove it/,
    )
    assert.equal(readFileSync(lockPath, 'utf8'), '')
  })

  it('retries transient unknown health against the same Host identity until it is open', async (t) => {
    const test = fixture()
    t.after(() => rmSync(test.base, { recursive: true, force: true }))
    const dependencies = simulatedDependencies(test)
    let probes = 0
    dependencies.portProbe = async () => ++probes === 1 ? 'unknown' : 'open'

    const result = await hotReloadPlugin(test.root, 'web', 'demo', 43127, 2_000, dependencies)
    assert.equal(result.hostPid, 4242)
    assert.ok(probes >= 2)
  })

  it('fails closed when Host health stays unknown through the command deadline', async (t) => {
    const test = fixture()
    t.after(() => rmSync(test.base, { recursive: true, force: true }))
    const dependencies = simulatedDependencies(test)
    dependencies.portProbe = async () => 'unknown'
    const before = readFileSync(test.patchPath, 'utf8')

    await assert.rejects(
      hotReloadPlugin(test.root, 'web', 'demo', 43127, 5, dependencies),
      /health remained unknown until the hot-reload timeout/,
    )
    assert.equal(readFileSync(test.patchPath, 'utf8'), before)
  })

  it('rejects an identity change while retrying unknown Host health', async (t) => {
    const test = fixture()
    t.after(() => rmSync(test.base, { recursive: true, force: true }))
    const dependencies = simulatedDependencies(test)
    let reads = 0
    dependencies.currentHost = () => ++reads === 1
      ? test.host
      : { ...test.host, pid: 4343, processStartedAt: 'birth-4343' }
    dependencies.portProbe = async () => 'unknown'

    await assert.rejects(
      hotReloadPlugin(test.root, 'web', 'demo', 43127, 2_000, dependencies),
      /currentHost identity changed during hot-reload health wait/,
    )
    assert.equal(reads, 2)
  })

  it('reports a closed Host port immediately instead of treating it as unknown', async (t) => {
    const test = fixture()
    t.after(() => rmSync(test.base, { recursive: true, force: true }))
    const dependencies = simulatedDependencies(test)
    dependencies.portProbe = async () => 'closed'

    await assert.rejects(
      hotReloadPlugin(test.root, 'web', 'demo', 43127, 2_000, dependencies),
      /currentHost port 43127 is closed during hot reload/,
    )
  })
})


describe('registered bundle root hot reload', () => {
  function bundleFixture() {
    const f = fixture()
    const pkgPath=join(f.plugin,'package.json')
    const pkg=JSON.parse(readFileSync(pkgPath,'utf8'))
    pkg.dsh={bundle:{patch:'./cordis.yml'}}
    writeFileSync(pkgPath,JSON.stringify(pkg))
    writeFileSync(join(f.profile,'package.json'),JSON.stringify({dsh:{profile:{bundles:['demo-runtime']}}}))
    writeFileSync(join(f.plugin,'cordis.yml'),'- insert:\n    - id: internal-plan\n      name: demo-runtime\n')
    writeFileSync(f.patchPath,'')
    return f
  }
  it('uses the exact bundle row id and retains observer and cleanup proof', async t => {
    const f=bundleFixture();t.after(()=>rmSync(f.base,{recursive:true,force:true}))
    const result=await hotReloadPlugin(f.root,'web','demo',43127,2000,simulatedDependencies(f))
    assert.equal(result.hostPid,4242)
    assert.equal(result.proof.moduleReloaded.samePid,true)
    assert.equal(result.journal.cleanupProved,true)
  })
  it('rejects missing registration, ambiguous targets and escaping patch paths before touching files',async t=>{
    for(const bad of ['unregistered','ambiguous','escape']) {
      const f=bundleFixture();t.after(()=>rmSync(f.base,{recursive:true,force:true}))
      if(bad==='unregistered') writeFileSync(join(f.profile,'package.json'),'{}')
      if(bad==='ambiguous') writeFileSync(join(f.plugin,'cordis.yml'),'- insert:\n    - id: one\n      name: demo-runtime\n    - id: two\n      name: demo-runtime\n')
      if(bad==='escape') {
        const path=join(f.plugin,'package.json'), pkg=JSON.parse(readFileSync(path,'utf8'))
        pkg.dsh.bundle.patch='../outside.yml'; writeFileSync(path,JSON.stringify(pkg));writeFileSync(join(f.plugin,'../outside.yml'),'[]')
      }
      await assert.rejects(hotReloadPlugin(f.root,'web','demo',43127,2000,simulatedDependencies(f)), /not proved|ambiguous|escapes/)
      assert.equal(readFileSync(f.patchPath,'utf8'),'')
    }
  })
})
