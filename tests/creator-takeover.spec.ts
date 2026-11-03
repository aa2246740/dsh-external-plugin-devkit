import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
// @ts-ignore -- same JS entry consumed by Host
import * as store from '../src/internal/creator-claims.mjs'
import { claimCreatorPlugin, releaseCreatorClaim, acquireCreatorActivationLock } from '../src/internal/creator.ts'
const context = (id: string) => ({ sessionId: id, hostPid: process.pid, hostParentPid: process.ppid, hostPort: 43127, bridgeVersion: 2 })
function fixture(t: any) {
 const root = mkdtempSync(join(tmpdir(), 'creator-takeover-')); t.after(() => rmSync(root, {recursive:true,force:true}))
 claimCreatorPlugin(root, 'demo', context('old')); claimCreatorPlugin(root, 'other', context('unrelated'))
 return root
}
function ready(root: string, id='request') {
 const grant = store.beginTakeover(root, store.inspectClaim(root,'demo'), context('new'), ['old','child'], id)
 store.markTakeoverReady(root, grant.id, grant.grant, ['old','child'])
 return grant
}
test('atomic transfer preserves other claims, revokes old and descendants, consumes grant and retains fences after release/TTL', t => {
 const root=fixture(t), other=store.inspectClaim(root,'other').claim, grant=ready(root)
 const receipt=store.commitTakeover(root,'demo',context('new'),grant)
 assert.equal(receipt.from,'old'); assert.equal(receipt.to,'new')
 assert.deepEqual(store.inspectClaim(root,'other').claim,other)
 assert.throws(()=>store.commitTakeover(root,'demo',context('new'),grant),/GRANT_INVALID/)
 releaseCreatorClaim(root,'new')
 for (const id of ['old','child']) assert.throws(()=>claimCreatorPlugin(root,'demo',context(id),Date.now()+864000000),/REVOKED/)
 assert.throws(()=>claimCreatorPlugin(root,'different',context('old')),/REVOKED/)
})
test('snapshot refresh and concurrent claim changes invalidate confirmation', t => {
 const root=fixture(t), snapshot=store.inspectClaim(root,'demo')
 claimCreatorPlugin(root,'demo',context('old'))
 assert.throws(()=>store.beginTakeover(root,snapshot,context('new'),['old'],'request'),/CLAIM_CHANGED/)
 assert.equal(store.inspectClaim(root,'demo').claim.sessionId,'old')
})
test('one pending transfer, no activation or auto refresh during drain; abort preserves owner', t => {
 const root=fixture(t), before=store.inspectClaim(root,'demo'), grant=ready(root)
 assert.throws(()=>ready(root,'second'),/PENDING/)
 assert.throws(()=>claimCreatorPlugin(root,'demo',context('old')),/REVOKED/)
 assert.throws(()=>acquireCreatorActivationLock(root,'demo',context('old')),/REVOKED/)
 releaseCreatorClaim(root,'old') // disposal cannot erase the CAS subject
 assert.equal(store.inspectClaim(root,'demo').fingerprint,before.fingerprint)
 store.abortTakeover(root,grant.id,grant.grant,'cancelled')
 assert.equal(store.inspectClaim(root,'demo').fingerprint,before.fingerprint)
 assert.doesNotThrow(()=>claimCreatorPlugin(root,'demo',context('old')))
})
test('active activation blocks takeover without deleting its lock', t=>{
 const root=fixture(t), release=acquireCreatorActivationLock(root,'demo',context('old'))
 const path=join(root,'.dshx/creator-plus/activation.lock'), bytes=readFileSync(path,'utf8')
 assert.throws(()=>ready(root),/CREATOR_BUSY/)
 assert.equal(readFileSync(path,'utf8'),bytes); release()
})
test('missing/foreign/expired/unready grant cannot transfer', t=>{
 const root=fixture(t), grant=store.beginTakeover(root,store.inspectClaim(root,'demo'),context('new'),['old'],'request')
 assert.throws(()=>store.commitTakeover(root,'demo',context('new'),null),/GRANT_REQUIRED/)
 assert.throws(()=>store.commitTakeover(root,'demo',context('new'),grant),/INVALID/)
 store.markTakeoverReady(root,grant.id,grant.grant,[])
 assert.throws(()=>store.commitTakeover(root,'demo',context('third'),grant),/INVALID/)
 assert.throws(()=>store.commitTakeover(root,'other',context('new'),grant),/INVALID/)
 assert.throws(()=>store.commitTakeover(root,'demo',{...context('new'),hostPort:1},grant),/INVALID/)
 assert.throws(()=>store.commitTakeover(root,'demo',context('new'),grant,Date.now()+61000),/EXPIRED/)
 assert.equal(store.inspectClaim(root,'demo').claim.sessionId,'old')
})
test('lease expiration does not authorize a second writer; explicit re-takeover is possible', t=>{
 const root=fixture(t)
 assert.throws(()=>claimCreatorPlugin(root,'demo',context('new'),Date.now()+864000000),/dshx_request_takeover/)
 store.commitTakeover(root,'demo',context('new'),ready(root))
 releaseCreatorClaim(root,'new')
 const grant=store.beginTakeover(root,store.inspectClaim(root,'demo'),context('old'),[],'return')
 store.markTakeoverReady(root,grant.id,grant.grant,[]);store.commitTakeover(root,'demo',context('old'),grant)
 assert.doesNotThrow(()=>claimCreatorPlugin(root,'demo',context('old')))
})
test('requestTakeover drains live background jobs through the SessionId and job.owner contract', async t => {
 const root = fixture(t)
 const { mkdirSync, copyFileSync } = await import('node:fs')
 mkdirSync(join(root, 'apps/cli/src'), { recursive: true })
 mkdirSync(join(root, 'tools/dshx/src/internal'), { recursive: true })
 writeFileSync(join(root, 'apps/cli/src/bin.ts'), '')
 writeFileSync(join(root, 'tools/dshx/src/cli.ts'), '')
 copyFileSync(join(process.cwd(), 'src/internal/creator-claims.mjs'), join(root, 'tools/dshx/src/internal/creator-claims.mjs'))
 // @ts-ignore -- runtime JS module
 const { requestTakeover } = await import('../src/creator-plus/takeover.js')
 const oldAgent = { id: 'old', status: 'idle', session: { header: { cwd: root }, snapshotEvents: () => [] }, cancel() {}, whenIdle: async () => {} }
 const newAgent = { id: 'new', status: 'idle', session: { header: { cwd: root }, snapshotEvents: () => [] }, cancel() {}, whenIdle: async () => {} }
 const listCallers: unknown[] = [], killCalls: unknown[][] = [], waitCalls: unknown[][] = []
 let jobStatus: 'running' | 'cancelled' = 'running'
 const jobs = {
  list(caller?: string) {
   listCallers.push(caller)
   if (caller !== 'old') return []
   return [{ id: 'job-1', owner: 'old', status: jobStatus }]
  },
  kill(id: string, caller?: string, reason?: string) {
   killCalls.push([id, caller, reason])
   if (caller !== 'old') throw new Error(`expected caller SessionId 'old', got ${String(caller)}`)
   jobStatus = 'cancelled'
   return 'requested'
  },
  async wait(id: string, timeoutMs: number, caller?: string) {
   waitCalls.push([id, timeoutMs, caller])
   if (caller !== 'old') throw new Error(`expected caller SessionId 'old', got ${String(caller)}`)
   return { id, owner: 'old', status: jobStatus }
  },
 }
 const agents = {
  get: (id: string) => id === 'old' ? oldAgent : id === 'new' ? newAgent : undefined,
  list: () => [oldAgent, newAgent],
  roots: () => [oldAgent, newAgent],
  isOwnedBy: () => false,
 }
 let observedApproveLabel = ''
 const ctx = {
  agents,
  jobs,
  tools: { guard: () => () => {} },
  on: () => () => {},
  effect: (fn: () => unknown) => fn(),
  userQuestions: {
   ask: async ({ questions }: any) => {
    const q = questions[0]
    observedApproveLabel = q.options[1].label
    return { answers: [{ id: q.id, selected: [q.options[1].label] }] }
   },
  },
 }
 const result = await requestTakeover(
  ctx,
  'demo',
  { agent: newAgent, signal: new AbortController().signal },
  {
   envRoot: root,
   configFile: '/missing',
   cwd: '/missing',
   moduleDir: '/missing',
   hostPort: 43127,
   runDshx: async (args: string[], _exec: unknown, opts: any) => {
    if (args[1] === 'watch') return { exitCode: 0, stdout: '{}', stderr: '' }
    if (args[1] === 'takeover') {
     store.commitTakeover(root, 'demo', context('new'), opts.takeoverGrant)
     return { exitCode: 0, stdout: '{}', stderr: '' }
    }
    throw new Error(`unexpected args: ${args.join(' ')}`)
   },
  },
 )
 assert.equal(result.exitCode, 0)
 assert.equal(observedApproveLabel, '停止旧任务并接管')
 assert.equal(jobStatus, 'cancelled')
 assert.ok(listCallers.includes('old'))
 assert.equal(listCallers.some(caller => typeof caller === 'object'), false)
 assert.deepEqual(killCalls, [['job-1', 'old', 'Creator+ user-confirmed takeover']])
 assert.deepEqual(waitCalls, [['job-1', 20_000, 'old']])
 assert.equal(store.inspectClaim(root, 'demo').claim.sessionId, 'new')
})
