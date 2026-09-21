/** Durable Creator ownership. Human confirmation stays in the Host bridge;
 * the CLI consumes a private, single-use grant after the Host proves quiescence. */
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const cell = new Int32Array(new SharedArrayBuffer(4))
const ttl = 86_400_000
const directory = root => join(root, '.dshx/creator-plus')
const file = root => join(directory(root), 'claims.json')
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const iso = now => new Date(now).toISOString()
export function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return true // unknown is not dead
  try { process.kill(pid, 0); return true } catch (e) { return e.code !== 'ESRCH' }
}
export function readClaimState(root) {
  let state
  try { state = JSON.parse(readFileSync(file(root), 'utf8')) }
  catch (e) { if (e.code === 'ENOENT') return { claims: [], revocations: [], takeovers: [], receipts: [] }; throw e }
  if (!state || !Array.isArray(state.claims)) throw new Error('CREATOR_STATE_INVALID')
  for (const key of ['revocations', 'takeovers', 'receipts']) {
    if (state[key] === undefined) state[key] = []
    if (!Array.isArray(state[key])) throw new Error('CREATOR_STATE_INVALID')
  }
  return state
}
function write(root, state) {
  const tmp = join(directory(root), `.${randomUUID()}.tmp`)
  try { writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }); renameSync(tmp, file(root)) }
  finally { rmSync(tmp, { force: true }) }
}
function lock(root, name) {
  mkdirSync(directory(root), { recursive: true })
  const path = join(directory(root), name), token = randomUUID(), deadline = Date.now() + 1000
  while (true) {
    try {
      const fd = openSync(path, 'wx', 0o600)
      try { writeFileSync(fd, JSON.stringify({ token, pid: process.pid, createdAt: iso(Date.now()) })) }
      finally { closeSync(fd) }
      return () => { try { if (JSON.parse(readFileSync(path, 'utf8')).token === token) rmSync(path) } catch {} }
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      let held
      try { held = JSON.parse(readFileSync(path, 'utf8')) } catch (error) { if (error.code === 'ENOENT') continue }
      // Never break a live or incompletely published lock based on elapsed time.
      if (held?.pid && !processAlive(held.pid)) { rmSync(path, { force: true }); continue }
      if (name === 'activation.lock' || Date.now() >= deadline) throw new Error(`CREATOR_BUSY: ${name}; retry after the current operation finishes`)
      Atomics.wait(cell, 0, 0, 10)
    }
  }
}
function update(root, callback, activation = false) {
  const releaseActivation = activation ? lock(root, 'activation.lock') : () => {}
  let release
  try { release = lock(root, 'claims.lock'); const state = readClaimState(root); const result = callback(state); write(root, state); return result }
  finally { release?.(); releaseActivation() }
}
function validPlugin(name) { if (typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('plugin name must be lower-case kebab-case') }
export function sessionFence(state, sessionId) {
  return state.takeovers.find(item => item.fencedSessions.includes(sessionId))
    ?? state.revocations.find(item => item.sessionId === sessionId)
}
export function assertUnfenced(root, sessionId, pluginId) {
  const state = readClaimState(root)
  if (sessionFence(state, sessionId)) throw new Error('CREATOR_OWNERSHIP_REVOKED: 此对话的开发权限已移交或正在移交；如需重新接手，请调用 dshx_request_takeover，由用户确认。')
  if (state.takeovers.some(item => item.pluginId === pluginId)) throw new Error('CREATOR_TAKEOVER_PENDING: 此插件正在接管中，请稍后重试。')
}
export function listClaims(root, now = Date.now()) { return readClaimState(root).claims.filter(item => Date.parse(item.expiresAt) > now) }
export function claimPlugin(root, pluginId, context, now = Date.now()) {
  validPlugin(pluginId)
  return update(root, state => {
    if (sessionFence(state, context.sessionId)) throw new Error('CREATOR_OWNERSHIP_REVOKED: 请调用 dshx_request_takeover，由用户确认后重新接手。')
    if (state.takeovers.some(item => item.pluginId === pluginId)) throw new Error('CREATOR_TAKEOVER_PENDING')
    // Lease expiry alone is not proof that a writer stopped. Keep raw ownership
    // until release or a confirmed takeover, including legacy expired records.
    const conflict = state.claims.find(item => item.pluginId === pluginId && item.sessionId !== context.sessionId)
    if (conflict) throw new Error([
      `plugin ${pluginId} is already claimed by Creator+ session ${conflict.sessionId}`,
      `当前会话：${context.sessionId}；持有认领的会话：${conflict.sessionId}。`,
      '分叉会话拥有独立身份。不要编造标题或链接；不要抢占、删除认领文件、卸载插件或重启 Host。',
      `最后刷新：${conflict.lastSeenAt}；租约到期：${conflict.expiresAt}。`,
      '直接调用 dshx_request_takeover({name: "' + pluginId + '"})，在当前对话请用户确认接管，无需寻找旧对话或等待租约。',
    ].join('\n'))
    const prior = state.claims.find(item => item.pluginId === pluginId && item.sessionId === context.sessionId)
    const claim = { pluginId, sessionId: context.sessionId, ...context.callId ? { callId: context.callId } : {}, ...context.rootCallId ? { rootCallId: context.rootCallId } : {}, hostPid: context.hostPid, hostPort: context.hostPort, claimedAt: prior?.claimedAt ?? iso(now), lastSeenAt: iso(now), expiresAt: iso(now + ttl), revision: randomUUID() }
    state.claims = state.claims.filter(item => item.sessionId !== context.sessionId && item.pluginId !== pluginId)
    state.claims.push(claim)
    return claim
  })
}
export function releaseClaims(root, sessionId) {
  return update(root, state => { state.claims = state.claims.filter(item => item.sessionId !== sessionId || state.takeovers.some(p => p.pluginId === item.pluginId)) })
}
export function inspectClaim(root, pluginId) {
  validPlugin(pluginId)
  const state = readClaimState(root), claim = state.claims.find(item => item.pluginId === pluginId) ?? null
  return { pluginId, claim, fingerprint: hash(claim), pending: state.takeovers.filter(item => item.pluginId === pluginId).map(({ grantHash, ...item }) => item) }
}
/** Called only by the fixed Host closure AFTER a fresh human question answer. */
export function beginTakeover(root, snapshot, context, fencedSessions, requestId, now = Date.now()) {
  validPlugin(snapshot.pluginId)
  const grant = randomUUID()
  const operation = update(root, state => {
    const current = state.claims.find(item => item.pluginId === snapshot.pluginId) ?? null
    if (hash(current) !== snapshot.fingerprint) throw new Error('CREATOR_CLAIM_CHANGED: 认领已变化，请重新申请并确认。')
    const pending = state.takeovers.find(item => item.pluginId === snapshot.pluginId)
    if (pending && processAlive(pending.hostPid)) throw new Error('CREATOR_TAKEOVER_PENDING')
    if (pending) state.takeovers = state.takeovers.filter(item => item !== pending)
    const entry = { id: requestId, pluginId: snapshot.pluginId, fingerprint: snapshot.fingerprint, previous: current, sessionId: context.sessionId, hostPid: context.hostPid, hostPort: context.hostPort, fencedSessions: [...new Set([...(pending?.fencedSessions ?? []), ...fencedSessions])], grantHash: hash(grant), confirmedAt: iso(now), expiresAt: iso(now + 60_000), ready: false }
    state.takeovers.push(entry)
    return entry
  }, true)
  return { id: operation.id, grant }
}
function findGrant(state, id, grant) {
  const pending = state.takeovers.find(item => item.id === id && item.grantHash === hash(grant))
  if (!pending) throw new Error('CREATOR_TAKEOVER_GRANT_INVALID')
  return pending
}
export function markTakeoverReady(root, id, grant, fencedSessions) {
  update(root, state => { const pending = findGrant(state, id, grant); pending.fencedSessions = [...new Set([...pending.fencedSessions, ...fencedSessions])]; pending.ready = true })
}
export function commitTakeover(root, pluginId, context, grant, now = Date.now()) {
  validPlugin(pluginId)
  if (!grant || typeof grant !== 'object') throw new Error('CREATOR_TAKEOVER_GRANT_REQUIRED: use dshx_request_takeover')
  return update(root, state => {
    const pending = findGrant(state, grant.id, grant.grant)
    if (pending.pluginId !== pluginId || pending.sessionId !== context.sessionId || pending.hostPid !== context.hostPid || pending.hostPort !== context.hostPort || !processAlive(pending.hostPid) || !pending.ready || Date.parse(pending.expiresAt) <= now) throw new Error('CREATOR_TAKEOVER_GRANT_INVALID_OR_EXPIRED')
    const current = state.claims.find(item => item.pluginId === pluginId) ?? null
    if (hash(current) !== pending.fingerprint) throw new Error('CREATOR_CLAIM_CHANGED')
    const receipt = { id: pending.id, pluginId, from: current?.sessionId ?? null, to: context.sessionId, confirmedAt: pending.confirmedAt, completedAt: iso(now), confirmation: 'user-questions', hostPid: context.hostPid, previous: current, revokedSessions: pending.fencedSessions }
    state.revocations = state.revocations.filter(item => !(item.pluginId === pluginId && item.sessionId === context.sessionId))
    for (const sessionId of pending.fencedSessions) if (sessionId !== context.sessionId && !state.revocations.some(item => item.sessionId === sessionId && item.pluginId === pluginId)) state.revocations.push({ sessionId, pluginId, transferredTo: context.sessionId, operationId: receipt.id, at: receipt.completedAt })
    state.claims = state.claims.filter(item => item.pluginId !== pluginId && item.sessionId !== context.sessionId)
    state.claims.push({ pluginId, sessionId: context.sessionId, hostPid: context.hostPid, hostPort: context.hostPort, claimedAt: iso(now), lastSeenAt: iso(now), expiresAt: iso(now + ttl), revision: randomUUID() })
    state.takeovers = state.takeovers.filter(item => item !== pending)
    state.receipts.push(receipt)
    return receipt
  }, true)
}
export function abortTakeover(root, id, grant, reason) {
  update(root, state => {
    const pending = state.takeovers.find(item => item.id === id && item.grantHash === hash(grant))
    if (!pending) return // a committed grant is already consumed
    state.takeovers = state.takeovers.filter(item => item !== pending)
    state.receipts.push({ id, pluginId: pending.pluginId, from: pending.previous?.sessionId ?? null, to: pending.sessionId, status: 'aborted', reason, at: iso(Date.now()) })
  })
}
