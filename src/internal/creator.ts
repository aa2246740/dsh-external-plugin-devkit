import { randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import {
  creatorActivationLockPath,
  creatorActiveTransactionPath,
  creatorClaimsLockPath,
  creatorClaimsPath,
  creatorIncidentsLockPath,
  creatorIncidentsPath,
  creatorQuarantinesPath,
  creatorTransactionsDir,
} from './paths.ts'
import { planWatchedPatch, writeWatchedPatch } from './new-client.ts'

const PLUGIN_ID = /^[a-z][a-z0-9-]*$/
const CLAIM_TTL_MS = 24 * 60 * 60 * 1000
const MAX_CONTEXT_ID = 256
const REGISTRY_LOCK_WAIT_MS = 1_000
const REGISTRY_LOCK_STALE_MS = 10_000
const sleepCell = new Int32Array(new SharedArrayBuffer(4))

export const CREATOR_CONTEXT_ENV = 'DSHX_CREATOR_CONTEXT'
export const CREATOR_CLIENT_FAILURE_ENV = 'DSHX_CREATOR_CLIENT_FAILURE'

export interface CreatorContext {
  sessionId: string
  callId?: string
  rootCallId?: string
  hostPid: number
  hostParentPid: number
  hostPort: number
  bridgeVersion: number
  workspaceRoot?: string
}

export interface CreatorClientFailureReport {
  hostPid: number
  hostParentPid: number
  hostPort: number
  failedIds: string[]
  message: string
}

export interface CreatorClaim {
  pluginId: string
  sessionId: string
  callId?: string
  rootCallId?: string
  claimedAt: string
  lastSeenAt: string
  expiresAt: string
}

export interface PatchSnapshot {
  path: string
  existed: boolean
  text: string
  afterText: string
  action: 'inserted' | 'retriggered'
}

export type CreatorTransactionStatus =
  | 'prepared'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'recovery-needed'
  | 'recovered'

export interface CreatorTransaction {
  id: string
  kind: 'new-client' | 'client-boot'
  pluginId: string
  sessionId?: string
  callId?: string
  rootCallId?: string
  hostPid?: number
  hostPort: number
  status: CreatorTransactionStatus
  startedAt: string
  updatedAt: string
  patch: PatchSnapshot
  retryingQuarantine: boolean
  error?: string
}

export interface CreatorQuarantine {
  pluginId: string
  transactionId: string
  createdAt: string
  mode: 'removed' | 'disabled'
  patch: PatchSnapshot
  marker?: string
}

export interface CreatorIncident {
  id: string
  createdAt: string
  reason: 'host-exited' | 'host-unhealthy' | 'client-failed' | 'crash-loop' | 'recovered-elsewhere'
  confidence: 'high' | 'probable' | 'ambiguous'
  sessionIds: string[]
  pluginId?: string
  transactionId?: string
  summary: string
  rollback: 'removed' | 'disabled' | 'none'
  previousPid?: number
  recoveredPid?: number
  port?: number
  logExcerpt?: string
  acknowledgedBy: string[]
}

interface ClaimsFile {
  claims: CreatorClaim[]
}

interface QuarantinesFile {
  quarantines: CreatorQuarantine[]
}

interface IncidentsFile {
  incidents: CreatorIncident[]
}

interface ActivationLock {
  token: string
  pid: number
  pluginId: string
  sessionId?: string
  createdAt: string
}

interface RegistryLock {
  token: string
  pid: number
  createdAt: string
}

export interface CreatorActivationHandle {
  transaction: CreatorTransaction
  release(): void
}

function iso(now: number): string {
  return new Date(now).toISOString()
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function boundedId(value: unknown, label: string, required: boolean): string | undefined {
  if (value === undefined && !required) return undefined
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_CONTEXT_ID) {
    throw new Error(`Creator Mode+ ${label} must be a non-empty bounded string`)
  }
  return value
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Creator Mode+ ${label} must be a positive integer`)
  }
  return value
}

function boundedAbsolutePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 4_096 || !isAbsolute(value)) {
    throw new Error(`Creator Mode+ ${label} must be an absolute bounded path`)
  }
  return resolve(value)
}

/** Parse identity stamped by the fixed Creator Mode+ bridge, never by model input. */
export function readCreatorContext(env: NodeJS.ProcessEnv = process.env): CreatorContext | undefined {
  const encoded = env[CREATOR_CONTEXT_ENV]
  if (!encoded) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(encoded)
  } catch {
    throw new Error(`${CREATOR_CONTEXT_ENV} is not valid JSON`)
  }
  const record = plainRecord(parsed)
  if (!record) throw new Error(`${CREATOR_CONTEXT_ENV} must be a JSON object`)
  const bridgeVersion = positiveInteger(record.bridgeVersion, 'bridgeVersion')
  if (bridgeVersion !== 2) throw new Error(`Creator Mode+ bridge v2 required, got v${bridgeVersion}`)
  const hostPort = positiveInteger(record.hostPort, 'hostPort')
  if (hostPort > 65_535) throw new Error('Creator Mode+ hostPort must be a valid TCP port')
  return {
    sessionId: boundedId(record.sessionId, 'sessionId', true)!,
    ...record.callId === undefined ? {} : { callId: boundedId(record.callId, 'callId', false) },
    ...record.rootCallId === undefined ? {} : { rootCallId: boundedId(record.rootCallId, 'rootCallId', false) },
    hostPid: positiveInteger(record.hostPid, 'hostPid'),
    hostParentPid: positiveInteger(record.hostParentPid, 'hostParentPid'),
    hostPort,
    bridgeVersion,
    ...record.workspaceRoot === undefined
      ? {}
      : { workspaceRoot: boundedAbsolutePath(record.workspaceRoot, 'workspaceRoot') },
  }
}

/** Parse a bounded browser-loader failure stamped and forwarded by the fixed Host bridge. */
export function readCreatorClientFailure(env: NodeJS.ProcessEnv = process.env): CreatorClientFailureReport | undefined {
  const encoded = env[CREATOR_CLIENT_FAILURE_ENV]
  if (!encoded) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(encoded)
  } catch {
    throw new Error(`${CREATOR_CLIENT_FAILURE_ENV} is not valid JSON`)
  }
  const record = plainRecord(parsed)
  if (!record) throw new Error(`${CREATOR_CLIENT_FAILURE_ENV} must be a JSON object`)
  if (!Array.isArray(record.failedIds) || record.failedIds.length > 64) {
    throw new Error('Creator+ client failure failedIds must be a bounded array')
  }
  const failedIds = record.failedIds.map((value) => {
    if (typeof value !== 'string' || value.length < 1 || value.length > 200 || !/^[A-Za-z0-9@/_.-]+$/.test(value)) {
      throw new Error('Creator+ client failure contains an invalid plugin id')
    }
    return value
  })
  if (typeof record.message !== 'string' || record.message.length > 8_000) {
    throw new Error('Creator+ client failure message must be a bounded string')
  }
  const hostPort = positiveInteger(record.hostPort, 'hostPort')
  if (hostPort > 65_535) throw new Error('Creator+ client failure hostPort must be valid')
  return {
    hostPid: positiveInteger(record.hostPid, 'hostPid'),
    hostParentPid: positiveInteger(record.hostParentPid, 'hostParentPid'),
    hostPort,
    failedIds: [...new Set(failedIds)],
    message: record.message,
  }
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Serialize short JSON registry updates across concurrent Creator+ CLI processes. */
function acquireRegistryLock(path: string): () => void {
  mkdirSync(dirname(path), { recursive: true })
  const deadline = Date.now() + REGISTRY_LOCK_WAIT_MS
  while (Date.now() <= deadline) {
    const token = randomUUID()
    const lock: RegistryLock = { token, pid: process.pid, createdAt: iso(Date.now()) }
    try {
      const fd = openSync(path, 'wx', 0o600)
      try {
        writeFileSync(fd, `${JSON.stringify(lock)}\n`)
      } finally {
        closeSync(fd)
      }
      return () => {
        try {
          const current = readJson<RegistryLock | undefined>(path, undefined)
          if (current?.token === token) rmSync(path, { force: true })
        } catch {
          // A stale or concurrently cleaned lock is already released.
        }
      }
    } catch (error) {
      if (!existsSync(path)) throw error
      let current: RegistryLock | undefined
      try {
        current = readJson<RegistryLock | undefined>(path, undefined)
      } catch {
        current = undefined
      }
      const createdAt = current ? Date.parse(current.createdAt) : Number.NaN
      if (!current?.pid || !processAlive(current.pid) || !Number.isFinite(createdAt) || Date.now() - createdAt > REGISTRY_LOCK_STALE_MS) {
        rmSync(path, { force: true })
        continue
      }
      Atomics.wait(sleepCell, 0, 0, 10)
    }
  }
  throw new Error('Creator+ state registry is busy; retry the same bounded operation')
}

function validatePluginId(pluginId: string): void {
  if (!PLUGIN_ID.test(pluginId)) throw new Error('plugin name must be lower-case kebab-case')
}

export function listCreatorClaims(root: string, now = Date.now()): CreatorClaim[] {
  const file = readJson<ClaimsFile>(creatorClaimsPath(root), { claims: [] })
  return file.claims.filter(claim => Date.parse(claim.expiresAt) > now)
}

/** Claim exactly one plugin for a Creator session; other sessions may claim other plugins concurrently. */
export function claimCreatorPlugin(
  root: string,
  pluginId: string,
  context: CreatorContext,
  now = Date.now(),
): CreatorClaim {
  validatePluginId(pluginId)
  const release = acquireRegistryLock(creatorClaimsLockPath(root))
  try {
    const claims = listCreatorClaims(root, now)
    const conflicting = claims.find(claim => claim.pluginId === pluginId && claim.sessionId !== context.sessionId)
    if (conflicting) {
      throw new Error(`plugin ${pluginId} is already claimed by Creator+ session ${conflicting.sessionId}`)
    }
    const previous = claims.find(claim => claim.sessionId === context.sessionId)
    const claimedAt = previous?.pluginId === pluginId ? previous.claimedAt : iso(now)
    const claim: CreatorClaim = {
      pluginId,
      sessionId: context.sessionId,
      ...context.callId ? { callId: context.callId } : {},
      ...context.rootCallId ? { rootCallId: context.rootCallId } : {},
      claimedAt,
      lastSeenAt: iso(now),
      expiresAt: iso(now + CLAIM_TTL_MS),
    }
    const next = claims.filter(item => item.sessionId !== context.sessionId && item.pluginId !== pluginId)
    next.push(claim)
    writeJson(creatorClaimsPath(root), { claims: next } satisfies ClaimsFile)
    return claim
  } finally {
    release()
  }
}

export function assertCreatorClaim(root: string, pluginId: string, context: CreatorContext): CreatorClaim {
  const claim = listCreatorClaims(root).find(item => item.pluginId === pluginId && item.sessionId === context.sessionId)
  if (!claim) {
    throw new Error(`Creator+ session ${context.sessionId} must claim ${pluginId} before live activation`)
  }
  return claim
}

export function releaseCreatorClaim(root: string, sessionId: string): void {
  const release = acquireRegistryLock(creatorClaimsLockPath(root))
  try {
    const claims = listCreatorClaims(root).filter(claim => claim.sessionId !== sessionId)
    writeJson(creatorClaimsPath(root), { claims } satisfies ClaimsFile)
  } finally {
    release()
  }
}

function readQuarantines(root: string): CreatorQuarantine[] {
  return readJson<QuarantinesFile>(creatorQuarantinesPath(root), { quarantines: [] }).quarantines
}

function writeQuarantines(root: string, quarantines: CreatorQuarantine[]): void {
  writeJson(creatorQuarantinesPath(root), { quarantines } satisfies QuarantinesFile)
}

export function creatorQuarantine(root: string, pluginId: string): CreatorQuarantine | undefined {
  return readQuarantines(root).find(item => item.pluginId === pluginId)
}

function writePatchSnapshot(snapshot: PatchSnapshot): void {
  if (snapshot.existed) writeWatchedPatch(snapshot.path, snapshot.text)
  else rmSync(snapshot.path, { force: true })
}

function acquireActivationLock(root: string, pluginId: string, context?: CreatorContext): () => void {
  const path = creatorActivationLockPath(root)
  mkdirSync(dirname(path), { recursive: true })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = randomUUID()
    const lock: ActivationLock = {
      token,
      pid: process.pid,
      pluginId,
      ...context ? { sessionId: context.sessionId } : {},
      createdAt: iso(Date.now()),
    }
    try {
      const fd = openSync(path, 'wx', 0o600)
      try {
        writeFileSync(fd, `${JSON.stringify(lock)}\n`)
      } finally {
        closeSync(fd)
      }
      return () => {
        try {
          const current = readJson<ActivationLock | undefined>(path, undefined)
          if (current?.token === token) rmSync(path, { force: true })
        } catch {
          // A stale or concurrently cleaned lock is already released.
        }
      }
    } catch (error) {
      if (!existsSync(path)) throw error
      let current: ActivationLock | undefined
      try {
        current = readJson<ActivationLock | undefined>(path, undefined)
      } catch {
        current = undefined
      }
      if (current?.pid && processAlive(current.pid)) {
        throw new Error(`another Creator+ live activation owns the global lock for ${current.pluginId}`)
      }
      rmSync(path, { force: true })
    }
  }
  throw new Error('could not acquire the Creator+ live activation lock')
}

function writeTransaction(root: string, transaction: CreatorTransaction, active: boolean): void {
  writeJson(join(creatorTransactionsDir(root), `${transaction.id}.json`), transaction)
  if (active) writeJson(creatorActiveTransactionPath(root), transaction)
}

export function readActiveCreatorTransaction(root: string): CreatorTransaction | undefined {
  return readJson<CreatorTransaction | undefined>(creatorActiveTransactionPath(root), undefined)
}

/** Return the latest durable mutation inside a short causal window, even after its command settled. */
export function latestCreatorTransaction(
  root: string,
  now = Date.now(),
  withinMs = 60_000,
  hostPort?: number,
  pluginId?: string,
): CreatorTransaction | undefined {
  const directory = creatorTransactionsDir(root)
  if (!existsSync(directory)) return undefined
  const transactions = readdirSync(directory)
    .filter(name => name.endsWith('.json'))
    .flatMap((name) => {
      try {
        const transaction = readJson<CreatorTransaction | undefined>(join(directory, name), undefined)
        return transaction ? [transaction] : []
      } catch {
        return []
      }
    })
    .filter(transaction => {
      const updated = Date.parse(transaction.updatedAt)
      return transaction.status !== 'recovered'
        && (hostPort === undefined || transaction.hostPort === hostPort)
        && (pluginId === undefined || transaction.pluginId === pluginId)
        && Number.isFinite(updated)
        && now >= updated
        && now - updated <= withinMs
    })
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
  return transactions[0]
}

/** Journal a claimed browser-loader failure for a plugin already present in the watched patch. */
export function createClientFailureTransaction(
  root: string,
  claim: CreatorClaim,
  report: CreatorClientFailureReport,
  patchPath: string,
  now = Date.now(),
): CreatorTransaction | undefined {
  const existed = existsSync(patchPath)
  const text = existed ? readFileSync(patchPath, 'utf8') : ''
  const plan = planWatchedPatch(existed ? text : undefined, claim.pluginId, claim.pluginId)
  if (plan.action !== 'retriggered') return undefined
  const transaction: CreatorTransaction = {
    id: randomUUID(),
    kind: 'client-boot',
    pluginId: claim.pluginId,
    sessionId: claim.sessionId,
    ...claim.callId ? { callId: claim.callId } : {},
    ...claim.rootCallId ? { rootCallId: claim.rootCallId } : {},
    hostPid: report.hostPid,
    hostPort: report.hostPort,
    status: 'recovery-needed',
    startedAt: iso(now),
    updatedAt: iso(now),
    patch: { path: patchPath, existed, text, afterText: plan.after, action: plan.action },
    retryingQuarantine: false,
    error: report.message,
  }
  writeTransaction(root, transaction, false)
  return transaction
}

export function beginCreatorActivation(
  root: string,
  pluginId: string,
  patchPath: string,
  hostPort: number,
  context?: CreatorContext,
  now = Date.now(),
): CreatorActivationHandle {
  validatePluginId(pluginId)
  if (context) assertCreatorClaim(root, pluginId, context)
  const release = acquireActivationLock(root, pluginId, context)
  try {
    const quarantine = creatorQuarantine(root, pluginId)
    const patch = quarantine?.patch ?? (() => {
      const existed = existsSync(patchPath)
      const text = existed ? readFileSync(patchPath, 'utf8') : ''
      const plan = planWatchedPatch(existed ? text : undefined, pluginId, pluginId)
      return { path: patchPath, existed, text, afterText: plan.after, action: plan.action } satisfies PatchSnapshot
    })()
    const transaction: CreatorTransaction = {
      id: randomUUID(),
      kind: 'new-client',
      pluginId,
      ...context ? {
        sessionId: context.sessionId,
        ...context.callId ? { callId: context.callId } : {},
        ...context.rootCallId ? { rootCallId: context.rootCallId } : {},
        hostPid: context.hostPid,
      } : {},
      hostPort,
      status: 'prepared',
      startedAt: iso(now),
      updatedAt: iso(now),
      patch,
      retryingQuarantine: quarantine !== undefined,
    }
    writeTransaction(root, transaction, true)
    if (quarantine) restoreCreatorQuarantine(quarantine)
    return { transaction, release }
  } catch (error) {
    release()
    throw error
  }
}

export function markCreatorActivationRunning(root: string, transaction: CreatorTransaction, now = Date.now()): CreatorTransaction {
  const next = { ...transaction, status: 'running' as const, updatedAt: iso(now) }
  writeTransaction(root, next, true)
  return next
}

export function applyCreatorQuarantine(
  root: string,
  transaction: CreatorTransaction,
  now = Date.now(),
): CreatorQuarantine {
  const { patch } = transaction
  let mode: CreatorQuarantine['mode']
  let marker: string | undefined
  const current = existsSync(patch.path) ? readFileSync(patch.path, 'utf8') : ''
  if (patch.action === 'inserted' && current === patch.afterText) {
    writePatchSnapshot(patch)
    mode = 'removed'
  } else {
    marker = `# dshx Creator+ quarantine ${transaction.id}\n- id: ${JSON.stringify(transaction.pluginId)}\n  disabled: true\n`
    writeWatchedPatch(patch.path, `${current.trimEnd()}\n${marker}`)
    mode = 'disabled'
  }
  const quarantine: CreatorQuarantine = {
    pluginId: transaction.pluginId,
    transactionId: transaction.id,
    createdAt: iso(now),
    mode,
    patch,
    ...marker ? { marker } : {},
  }
  const next = readQuarantines(root).filter(item => item.pluginId !== transaction.pluginId)
  next.push(quarantine)
  writeQuarantines(root, next)
  return quarantine
}

/** Serialize Guardian patch recovery against every Creator+ live activation. */
export function quarantineCreatorTransaction(
  root: string,
  transaction: CreatorTransaction,
  now = Date.now(),
): CreatorQuarantine {
  const release = acquireActivationLock(root, transaction.pluginId)
  try {
    return applyCreatorQuarantine(root, transaction, now)
  } finally {
    release()
  }
}

/** Remove only the unique quarantine override; never restore a whole stale file over other sessions. */
function restoreCreatorQuarantine(quarantine: CreatorQuarantine): void {
  if (quarantine.mode === 'removed') return
  const { marker, patch } = quarantine
  if (!marker) throw new Error(`quarantine for ${quarantine.pluginId} has no reversible marker`)
  if (!existsSync(patch.path)) throw new Error(`quarantined patch disappeared: ${patch.path}`)
  const current = readFileSync(patch.path, 'utf8')
  const first = current.indexOf(marker)
  if (first < 0 || current.indexOf(marker, first + marker.length) >= 0) {
    throw new Error(`quarantine marker for ${quarantine.pluginId} is missing or duplicated; refusing to overwrite concurrent patch changes`)
  }
  writeWatchedPatch(patch.path, current.slice(0, first) + current.slice(first + marker.length))
}

export function finishCreatorActivation(
  root: string,
  transaction: CreatorTransaction,
  outcome: { ok: boolean; hostAlive: boolean; error?: string },
  now = Date.now(),
): CreatorTransaction {
  let status: CreatorTransactionStatus
  if (outcome.ok) {
    status = 'succeeded'
    writeQuarantines(root, readQuarantines(root).filter(item => item.pluginId !== transaction.pluginId))
  } else if (!outcome.hostAlive) {
    status = 'recovery-needed'
  } else {
    status = 'failed'
    if (transaction.retryingQuarantine) applyCreatorQuarantine(root, transaction, now)
  }
  const next: CreatorTransaction = {
    ...transaction,
    status,
    updatedAt: iso(now),
    ...outcome.error ? { error: outcome.error } : {},
  }
  writeTransaction(root, next, status === 'recovery-needed')
  if (status !== 'recovery-needed') rmSync(creatorActiveTransactionPath(root), { force: true })
  return next
}

export function markCreatorTransactionRecovered(
  root: string,
  transaction: CreatorTransaction,
  now = Date.now(),
): CreatorTransaction {
  const next = { ...transaction, status: 'recovered' as const, updatedAt: iso(now) }
  writeTransaction(root, next, false)
  const active = readActiveCreatorTransaction(root)
  if (active?.id === transaction.id) rmSync(creatorActiveTransactionPath(root), { force: true })
  return next
}

function readIncidents(root: string): CreatorIncident[] {
  return readJson<IncidentsFile>(creatorIncidentsPath(root), { incidents: [] }).incidents
}

export function recordCreatorIncident(root: string, incident: Omit<CreatorIncident, 'id' | 'createdAt' | 'acknowledgedBy'>, now = Date.now()): CreatorIncident {
  const release = acquireRegistryLock(creatorIncidentsLockPath(root))
  try {
    const complete: CreatorIncident = {
      id: randomUUID(),
      createdAt: iso(now),
      ...incident,
      acknowledgedBy: [],
    }
    const incidents = [...readIncidents(root), complete].slice(-200)
    writeJson(creatorIncidentsPath(root), { incidents } satisfies IncidentsFile)
    return complete
  } finally {
    release()
  }
}

export function pendingCreatorIncidents(root: string, sessionId: string): CreatorIncident[] {
  return readIncidents(root).filter(incident => (
    incident.sessionIds.includes(sessionId) && !incident.acknowledgedBy.includes(sessionId)
  ))
}

export function acknowledgeCreatorIncident(root: string, sessionId: string, incidentId: string): boolean {
  const release = acquireRegistryLock(creatorIncidentsLockPath(root))
  try {
    let found = false
    const incidents = readIncidents(root).map((incident) => {
      if (incident.id !== incidentId || !incident.sessionIds.includes(sessionId)) return incident
      found = true
      if (incident.acknowledgedBy.includes(sessionId)) return incident
      return { ...incident, acknowledgedBy: [...incident.acknowledgedBy, sessionId] }
    })
    if (found) writeJson(creatorIncidentsPath(root), { incidents } satisfies IncidentsFile)
    return found
  } finally {
    release()
  }
}

export function creatorSnapshot(root: string): {
  claims: CreatorClaim[]
  activeTransaction?: CreatorTransaction
  quarantines: CreatorQuarantine[]
  pendingIncidentCount: number
} {
  const activeTransaction = readActiveCreatorTransaction(root)
  return {
    claims: listCreatorClaims(root),
    ...activeTransaction ? { activeTransaction } : {},
    quarantines: readQuarantines(root),
    pendingIncidentCount: readIncidents(root).filter(item => item.acknowledgedBy.length < item.sessionIds.length).length,
  }
}
