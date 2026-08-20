import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import {
  createClientFailureTransaction,
  creatorQuarantine,
  creatorSnapshot,
  latestCreatorTransaction,
  listCreatorClaims,
  markCreatorTransactionRecovered,
  readActiveCreatorTransaction,
  recordCreatorIncident,
  quarantineCreatorTransaction,
  type CreatorClientFailureReport,
  type CreatorContext,
  type CreatorIncident,
} from './creator.ts'
import { waitForClientAbsent } from './new-client.ts'
import {
  clearHostState,
  currentHost,
  pidAlive,
  portOpen,
  readHostState,
  readLogTail,
  startHost,
  stopHost,
  waitForHttp,
  writeHostState,
} from './host.ts'
import {
  dshxPackageRoot,
  guardianControlLockPath,
  guardianControlPath,
  guardianLogPath,
  guardianStartLockPath,
  guardianStatePath,
  profileDir,
  resolveDshHome,
} from './paths.ts'
import { DSHX_VERSION, type HostState } from './types.ts'

const STARTUP_GRACE_MS = 10_000
const UNHEALTHY_GRACE_MS = 10_000
const HEALTHY_RESET_MS = 30_000
const RECOVERY_FUSE_MS = 30_000
const CAUSAL_WINDOW_MS = 15_000
const GUARDIAN_START_WAIT_MS = 3_000
const APP_RECOVERY_GRACE_MS = 2_000
const guardianSleepCell = new Int32Array(new SharedArrayBuffer(4))

export interface GuardianDesiredHost {
  profile: 'web'
  port: number
  plugin?: string
  overlay: string
  ownership: 'spawned' | 'adopted'
  hostPid: number
  launcherPid?: number
  armedAt: string
}

export interface GuardianControl {
  generation: string
  enabled: boolean
  desired?: GuardianDesiredHost
  suppressUntil?: string
  unhealthySince?: string
  healthySince?: string
  lastRecoveryAt?: string
  consecutiveRecoveries: number
}

export interface GuardianRuntimeState {
  pid: number
  version: string
  startedAt: string
  heartbeatAt: string
}

export interface GuardianStatus {
  running: boolean
  state?: GuardianRuntimeState
  control: GuardianControl
}

export interface GuardianCycleResult {
  action: 'disabled' | 'suppressed' | 'superseded' | 'launcher-exited' | 'healthy' | 'waiting' | 'restarted' | 'fused' | 'recovered-elsewhere'
  incident?: CreatorIncident
  host?: HostState
}

export interface ClientFailureRecoveryResult {
  reload: boolean
  incident: CreatorIncident
}

interface GuardianDependencies {
  now?: () => number
  pidAlive?: (pid: number) => boolean
  portOpen?: (port: number) => Promise<boolean>
  stopHost?: (root: string) => Promise<HostState | undefined>
  startHost?: typeof startHost
  waitForHttp?: (port: number, timeoutMs: number) => Promise<boolean>
  waitForExternalRecovery?: (port: number, timeoutMs: number) => Promise<boolean>
  readLogTail?: (path: string, maxLines?: number) => string
}

interface EnsureDependencies {
  spawnDaemon?: typeof spawn
  waitMs?: number
}

function iso(now: number): string {
  return new Date(now).toISOString()
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function writeJson(path: string, value: unknown): void {
  const parent = dirname(path)
  mkdirSync(parent, { recursive: true })
  const temporary = join(parent, `.${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

function defaultControl(): GuardianControl {
  return { generation: 'legacy', enabled: false, consecutiveRecoveries: 0 }
}

export function readGuardianControl(root: string): GuardianControl {
  return readJson<GuardianControl>(guardianControlPath(root), defaultControl())
}

export function writeGuardianControl(root: string, control: GuardianControl): void {
  writeJson(guardianControlPath(root), control)
}

function acquireControlLock(root: string): () => void {
  const path = guardianControlLockPath(root)
  mkdirSync(dirname(path), { recursive: true })
  const deadline = Date.now() + GUARDIAN_START_WAIT_MS
  while (Date.now() <= deadline) {
    try {
      const fd = openSync(path, 'wx', 0o600)
      try {
        writeFileSync(fd, `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`)
      } finally {
        closeSync(fd)
      }
      return () => rmSync(path, { force: true })
    } catch (error) {
      if (!existsSync(path)) throw error
      let owner = 0
      try {
        owner = Number((JSON.parse(readFileSync(path, 'utf8')) as { pid?: unknown }).pid ?? 0)
      } catch {
        owner = 0
      }
      if (owner > 0 && pidAlive(owner)) {
        Atomics.wait(guardianSleepCell, 0, 0, 10)
        continue
      }
      rmSync(path, { force: true })
    }
  }
  throw new Error('timed out waiting for the Guardian control lock')
}

function updateGuardianControl(root: string, mutate: (previous: GuardianControl) => GuardianControl): GuardianControl {
  const release = acquireControlLock(root)
  try {
    const next = mutate(readGuardianControl(root))
    writeGuardianControl(root, next)
    return next
  } finally {
    release()
  }
}

function writeGuardianControlIfCurrent(root: string, generation: string, next: GuardianControl): boolean {
  const release = acquireControlLock(root)
  try {
    if (readGuardianControl(root).generation !== generation) return false
    writeGuardianControl(root, next)
    return true
  } finally {
    release()
  }
}

export function readGuardianState(root: string): GuardianRuntimeState | undefined {
  return readJson<GuardianRuntimeState | undefined>(guardianStatePath(root), undefined)
}

export function writeGuardianState(root: string, state: GuardianRuntimeState): void {
  writeJson(guardianStatePath(root), state)
}

export function clearGuardianState(root: string): void {
  rmSync(guardianStatePath(root), { force: true })
}

export function armGuardian(root: string, host: HostState, now = Date.now()): GuardianControl {
  if (host.profile !== 'web') return readGuardianControl(root)
  return updateGuardianControl(root, (previous) => {
    // A replacement started by Guardian is process-owned by dshx but still
    // belongs to the adopted App launcher's lifetime. Preserve that lineage
    // when a new Creator session inside the replacement re-arms the target.
    const inheritedAppLineage = host.ownership === 'spawned'
      && previous.desired?.hostPid === host.pid
      && previous.desired.ownership === 'adopted'
      && previous.desired.launcherPid !== undefined
    const ownership = inheritedAppLineage ? 'adopted' : (host.ownership ?? 'spawned')
    const launcherPid = inheritedAppLineage ? previous.desired!.launcherPid : host.launcherPid
    const targetChanged = previous.desired?.hostPid !== host.pid
      || previous.desired?.port !== host.port
      || previous.desired?.ownership !== ownership
      || previous.desired?.launcherPid !== launcherPid
    return {
      generation: randomUUID(),
      enabled: true,
      desired: {
        profile: 'web',
        port: host.port,
        ...host.plugin ? { plugin: host.plugin } : {},
        overlay: host.overlay,
        ownership,
        hostPid: host.pid,
        ...launcherPid ? { launcherPid } : {},
        armedAt: iso(now),
      },
      consecutiveRecoveries: targetChanged ? 0 : previous.consecutiveRecoveries,
      ...!targetChanged && previous.lastRecoveryAt ? { lastRecoveryAt: previous.lastRecoveryAt } : {},
      ...!targetChanged && previous.healthySince ? { healthySince: previous.healthySince } : {},
    }
  })
}

export function disarmGuardian(root: string, now = Date.now(), suppressMs = 0): GuardianControl {
  return updateGuardianControl(root, previous => ({
    ...previous,
    generation: randomUUID(),
    enabled: false,
    ...suppressMs > 0 ? { suppressUntil: iso(now + suppressMs) } : {},
  }))
}

export function guardianStatus(root: string): GuardianStatus {
  const state = readGuardianState(root)
  return {
    running: Boolean(state?.pid && pidAlive(state.pid)),
    ...state ? { state } : {},
    control: readGuardianControl(root),
  }
}

function acquireStartLock(root: string): () => void {
  const path = guardianStartLockPath(root)
  mkdirSync(dirname(path), { recursive: true })
  const deadline = Date.now() + GUARDIAN_START_WAIT_MS
  while (Date.now() <= deadline) {
    try {
      const fd = openSync(path, 'wx', 0o600)
      try {
        writeFileSync(fd, `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`)
      } finally {
        closeSync(fd)
      }
      return () => rmSync(path, { force: true })
    } catch (error) {
      if (!existsSync(path)) throw error
      let owner = 0
      try {
        owner = Number((JSON.parse(readFileSync(path, 'utf8')) as { pid?: unknown }).pid ?? 0)
      } catch {
        owner = 0
      }
      if (owner > 0 && pidAlive(owner)) {
        Atomics.wait(guardianSleepCell, 0, 0, 10)
        continue
      }
      rmSync(path, { force: true })
    }
  }
  throw new Error('timed out waiting for concurrent dshx Guardian startup')
}

/** Ensure the deterministic external monitor exists; it never runs inside the DSH Host. */
export async function ensureGuardian(root: string, dependencies: EnsureDependencies = {}): Promise<GuardianRuntimeState> {
  const existing = readGuardianState(root)
  if (existing?.pid && pidAlive(existing.pid)) return existing
  const release = acquireStartLock(root)
  try {
    const raced = readGuardianState(root)
    if (raced?.pid && pidAlive(raced.pid)) return raced
    const packageRoot = dshxPackageRoot()
    const packagePath = join(packageRoot, 'package.json')
    const loader = createRequire(packagePath).resolve('tsx/esm')
    const daemon = join(packageRoot, 'src/guardian-daemon.ts')
    const log = guardianLogPath(root)
    mkdirSync(dirname(log), { recursive: true })
    const out = openSync(log, 'a', 0o600)
    const spawnDaemon = dependencies.spawnDaemon ?? spawn
    const child = spawnDaemon(process.execPath, ['--import', loader, daemon, '--harness', root], {
      cwd: root,
      detached: true,
      env: { ...process.env, DSHX_HARNESS: root, DSHX_GUARDIAN_DAEMON: '1' },
      stdio: ['ignore', out, out],
    })
    closeSync(out)
    if (child.pid === undefined) throw new Error('failed to spawn dshx Guardian')
    child.unref()
    const deadline = Date.now() + (dependencies.waitMs ?? 3_000)
    do {
      const state = readGuardianState(root)
      if (state?.pid === child.pid) return state
      await new Promise(resolve => setTimeout(resolve, 50))
    } while (Date.now() < deadline)
    throw new Error(`dshx Guardian pid ${child.pid} did not publish a heartbeat`)
  } finally {
    release()
  }
}

/** Adopt the current official Web Host when it was launched by a wrapper or plain dsh rather than dshx. */
export async function adoptOrArmCreatorHost(
  root: string,
  context: CreatorContext,
  dependencies: { portOpen?: (port: number) => Promise<boolean>; ensureGuardian?: typeof ensureGuardian } = {},
): Promise<{ host: HostState; guardian: GuardianRuntimeState; adopted: boolean }> {
  const existing = currentHost(root)
  let host: HostState
  let adopted = false
  if (existing) {
    if (existing.port !== context.hostPort) {
      throw new Error(`dshx supervises port ${existing.port}, but this Creator+ session runs on ${context.hostPort}`)
    }
    const checkPort = dependencies.portOpen ?? portOpen
    if (!await checkPort(context.hostPort)) throw new Error(`Creator+ Host port ${context.hostPort} is not healthy`)
    if (existing.pid !== context.hostPid) {
      if (existing.ownership !== 'adopted') {
        throw new Error(`dshx-owned Host pid ${existing.pid} does not match Creator+ Host pid ${context.hostPid}`)
      }
      if (!pidAlive(context.hostPid)) throw new Error(`Creator+ Host pid ${context.hostPid} is not alive`)
      host = {
        ...existing,
        pid: context.hostPid,
        launcherPid: context.hostParentPid,
        startedAt: new Date().toISOString(),
        command: [],
        ownership: 'adopted',
      }
      writeHostState(root, host)
      adopted = true
    } else {
      host = existing
    }
  } else {
    const checkPort = dependencies.portOpen ?? portOpen
    if (!pidAlive(context.hostPid)) throw new Error(`Creator+ Host pid ${context.hostPid} is not alive`)
    if (!await checkPort(context.hostPort)) throw new Error(`Creator+ Host port ${context.hostPort} is not healthy`)
    host = {
      pid: context.hostPid,
      profile: 'web',
      port: context.hostPort,
      overlay: '',
      logFile: guardianLogPath(root),
      startedAt: new Date().toISOString(),
      command: [],
      ownership: 'adopted',
      launcherPid: context.hostParentPid,
    }
    writeHostState(root, host)
    adopted = true
  }
  armGuardian(root, host)
  const guardian = await (dependencies.ensureGuardian ?? ensureGuardian)(root)
  return { host, guardian, adopted }
}

function diagnosticExcerpt(text: string, pluginId?: string): string | undefined {
  const selected = text.split(/\r?\n/).filter((line) => {
    const lower = line.toLowerCase()
    return Boolean(pluginId && line.includes(pluginId))
      || lower.includes('failed to apply loader entry')
      || lower.includes('plugin tree failed')
      || lower.includes('error')
  }).slice(-20)
  const joined = selected.join('\n').slice(-8_000)
  return joined || undefined
}

function incidentSessions(root: string, transactionSession?: string): string[] {
  if (transactionSession) return [transactionSession]
  return [...new Set(listCreatorClaims(root).map(claim => claim.sessionId))]
}

function causalTransaction(root: string, port: number, now: number) {
  const active = readActiveCreatorTransaction(root)
  const transaction = active?.hostPort === port
    ? active
    : latestCreatorTransaction(root, now, CAUSAL_WINDOW_MS, port)
  const confidence: CreatorIncident['confidence'] = active && transaction && active.id === transaction.id
    ? 'high'
    : transaction
      ? 'probable'
      : 'ambiguous'
  return { transaction, confidence }
}

/** Quarantine a browser FAILED entry while the Host itself remains healthy. */
export async function recoverCreatorClientFailure(
  root: string,
  report: CreatorClientFailureReport,
  dependencies: { now?: () => number; waitForClientAbsent?: typeof waitForClientAbsent } = {},
): Promise<ClientFailureRecoveryResult> {
  const now = (dependencies.now ?? Date.now)()
  const failedPluginIds = [...new Set(report.failedIds.filter(id => /^[a-z][a-z0-9-]*$/.test(id)))]
  const claims = listCreatorClaims(root, now)
  const observedHost = currentHost(root)
  if (observedHost?.pid !== report.hostPid || observedHost.port !== report.hostPort) {
    const incident = recordCreatorIncident(root, {
      reason: 'client-failed',
      confidence: 'ambiguous',
      sessionIds: [...new Set(claims.map(claim => claim.sessionId))],
      summary: 'Ignored a stale or unarmed browser failure report because its Host identity did not match the externally observed Web Host.',
      rollback: 'none',
      port: report.hostPort,
      logExcerpt: report.message,
    }, now)
    return { reload: false, incident }
  }
  const quarantined = failedPluginIds
    .map(id => creatorQuarantine(root, id))
    .filter(item => item !== undefined)
  if (quarantined.length === 1) {
    const quarantine = quarantined[0]!
    const sessionIds = claims.filter(claim => claim.pluginId === quarantine.pluginId).map(claim => claim.sessionId)
    const absent = await (dependencies.waitForClientAbsent ?? waitForClientAbsent)(quarantine.pluginId, report.hostPort, 8_000)
    const incident = recordCreatorIncident(root, {
      reason: 'client-failed',
      confidence: 'probable',
      sessionIds,
      pluginId: quarantine.pluginId,
      transactionId: quarantine.transactionId,
      summary: absent
        ? `Creator+ Guardian confirmed ${quarantine.pluginId} remains quarantined and the browser may reload.`
        : `Creator+ Guardian kept ${quarantine.pluginId} quarantined, but the current Host did not prove its removal before timeout.`,
      rollback: quarantine.mode,
      port: report.hostPort,
      logExcerpt: report.message,
    }, now)
    return { reload: absent, incident }
  }

  const active = readActiveCreatorTransaction(root)
  let transaction = active
    && active.hostPort === report.hostPort
    && (failedPluginIds.length === 0 || failedPluginIds.includes(active.pluginId))
    ? active
    : undefined
  let confidence: CreatorIncident['confidence'] = transaction ? 'high' : 'ambiguous'

  if (!transaction) {
    const recent = failedPluginIds
      .map(id => latestCreatorTransaction(root, now, 24 * 60 * 60 * 1_000, report.hostPort, id))
      .filter(item => item !== undefined)
      .filter((item, index, all) => all.findIndex(candidate => candidate!.id === item!.id) === index)
    if (recent.length === 1) {
      transaction = recent[0]
      confidence = 'probable'
    }
  }

  if (!transaction) {
    const matchedClaims = claims.filter(claim => failedPluginIds.includes(claim.pluginId))
    if (matchedClaims.length === 1) {
      try {
        transaction = createClientFailureTransaction(
          root,
          matchedClaims[0]!,
          report,
          join(profileDir(resolveDshHome(), 'web'), 'cordis.patch.yml'),
          now,
        )
        if (transaction) confidence = 'probable'
      } catch {
        transaction = undefined
      }
    }
  }

  if (!transaction) {
    const incident = recordCreatorIncident(root, {
      reason: 'client-failed',
      confidence: 'ambiguous',
      sessionIds: [...new Set(claims.map(claim => claim.sessionId))],
      summary: 'The browser plugin tree failed while the Host remained healthy, but no single claimed watched-patch plugin could be quarantined safely.',
      rollback: 'none',
      port: report.hostPort,
      logExcerpt: report.message,
    }, now)
    return { reload: false, incident }
  }

  const quarantine = quarantineCreatorTransaction(root, transaction, now)
  markCreatorTransactionRecovered(root, transaction, now)
  const absent = await (dependencies.waitForClientAbsent ?? waitForClientAbsent)(transaction.pluginId, report.hostPort, 8_000)
  const incident = recordCreatorIncident(root, {
    reason: 'client-failed',
    confidence,
    sessionIds: incidentSessions(root, transaction.sessionId),
    pluginId: transaction.pluginId,
    transactionId: transaction.id,
    summary: absent
      ? `Creator+ Guardian quarantined browser entry ${transaction.pluginId}; the current Host removed it and the page may reload.`
      : `Creator+ Guardian quarantined browser entry ${transaction.pluginId}, but the current Host did not prove its removal before timeout.`,
    rollback: quarantine.mode,
    port: report.hostPort,
    logExcerpt: report.message,
  }, now)
  return { reload: absent, incident }
}

/** Execute one bounded health/recovery decision. The daemon repeatedly calls this function. */
export async function runGuardianCycle(root: string, dependencies: GuardianDependencies = {}): Promise<GuardianCycleResult> {
  const now = (dependencies.now ?? Date.now)()
  const alive = dependencies.pidAlive ?? pidAlive
  const checkPort = dependencies.portOpen ?? portOpen
  const stop = dependencies.stopHost ?? stopHost
  const start = dependencies.startHost ?? startHost
  const waitHttp = dependencies.waitForHttp ?? waitForHttp
  const waitExternalRecovery = dependencies.waitForExternalRecovery ?? waitForHttp
  const tail = dependencies.readLogTail ?? readLogTail
  let control = readGuardianControl(root)
  if (!control.enabled || !control.desired) return { action: 'disabled' }
  if (control.suppressUntil && Date.parse(control.suppressUntil) > now) return { action: 'suppressed' }
  const generation = control.generation
  const stored = readHostState(root)
  if (control.desired.ownership === 'adopted'
    && control.desired.launcherPid
    && !alive(control.desired.launcherPid)) {
    if (stored?.ownership === 'spawned' && stored.pid && alive(stored.pid)) await stop(root)
    else if (stored?.pid && !alive(stored.pid)) clearHostState(root)
    if (!writeGuardianControlIfCurrent(root, generation, { ...control, enabled: false })) {
      return { action: 'superseded' }
    }
    return { action: 'launcher-exited' }
  }

  const pidIsAlive = Boolean(stored?.pid && alive(stored.pid))
  const httpIsHealthy = pidIsAlive && stored!.profile === 'web' && await checkPort(stored!.port)
  if (readGuardianControl(root).generation !== generation) return { action: 'superseded' }
  if (pidIsAlive && httpIsHealthy) {
    const healthySince = control.healthySince ? Date.parse(control.healthySince) : now
    control = {
      ...control,
      healthySince: iso(healthySince),
      ...now - healthySince >= HEALTHY_RESET_MS ? { consecutiveRecoveries: 0 } : {},
    }
    delete control.unhealthySince
    delete control.suppressUntil
    if (!writeGuardianControlIfCurrent(root, generation, control)) return { action: 'superseded' }
    return { action: 'healthy', host: stored }
  }

  let recoveredElsewhere = false
  if (pidIsAlive) {
    const startedAt = Date.parse(stored!.startedAt)
    if (Number.isFinite(startedAt) && now - startedAt < STARTUP_GRACE_MS) return { action: 'waiting', host: stored }
    const unhealthySince = control.unhealthySince ? Date.parse(control.unhealthySince) : now
    if (now - unhealthySince < UNHEALTHY_GRACE_MS) {
      if (!writeGuardianControlIfCurrent(root, generation, { ...control, unhealthySince: iso(unhealthySince) })) {
        return { action: 'superseded' }
      }
      return { action: 'waiting', host: stored }
    }
    await stop(root)
    if (readGuardianControl(root).generation !== generation) return { action: 'superseded' }
    recoveredElsewhere = control.desired.ownership === 'adopted' && control.desired.launcherPid
      ? await waitExternalRecovery(control.desired.port, APP_RECOVERY_GRACE_MS)
      : await checkPort(control.desired.port)
  } else {
    recoveredElsewhere = control.desired.ownership === 'adopted' && control.desired.launcherPid
      ? await waitExternalRecovery(control.desired.port, APP_RECOVERY_GRACE_MS)
      : await checkPort(control.desired.port)
  }

  if (recoveredElsewhere) {
    if (readGuardianControl(root).generation !== generation) return { action: 'superseded' }
    clearHostState(root)
    const { transaction, confidence } = causalTransaction(root, control.desired.port, now)
    const quarantine = transaction ? quarantineCreatorTransaction(root, transaction, now) : undefined
    if (transaction) markCreatorTransactionRecovered(root, transaction, now)
    const nextControl = { ...control, enabled: false }
    if (!writeGuardianControlIfCurrent(root, generation, nextControl)) return { action: 'superseded' }
    const incident = recordCreatorIncident(root, {
      reason: 'recovered-elsewhere',
      confidence,
      sessionIds: incidentSessions(root, transaction?.sessionId),
      ...transaction ? { pluginId: transaction.pluginId, transactionId: transaction.id } : {},
      summary: transaction
        ? `Another supervisor restored port ${control.desired.port}; Creator+ Guardian quarantined ${transaction.pluginId} without starting a duplicate listener.`
        : `The previous Host exited, but another supervisor restored port ${control.desired.port}. DSHX did not start a duplicate listener.`,
      rollback: quarantine?.mode ?? 'none',
      ...stored?.pid ? { previousPid: stored.pid } : {},
      port: control.desired.port,
    }, now)
    return { action: 'recovered-elsewhere', incident }
  } else if (readGuardianControl(root).generation !== generation) {
    return { action: 'superseded' }
  }

  const lastRecovery = control.lastRecoveryAt ? Date.parse(control.lastRecoveryAt) : 0
  const { transaction, confidence } = causalTransaction(root, control.desired.port, now)
  const sessions = incidentSessions(root, transaction?.sessionId)
  const previousPid = stored?.pid
  const excerpt = stored?.logFile ? diagnosticExcerpt(tail(stored.logFile, 120), transaction?.pluginId) : undefined
  if (control.consecutiveRecoveries >= 1 && now - lastRecovery < RECOVERY_FUSE_MS) {
    if (!writeGuardianControlIfCurrent(root, generation, { ...control, enabled: false })) {
      return { action: 'superseded' }
    }
    const incident = recordCreatorIncident(root, {
      reason: 'crash-loop',
      confidence,
      sessionIds: sessions,
      ...transaction ? { pluginId: transaction.pluginId, transactionId: transaction.id } : {},
      summary: 'Creator+ Guardian stopped after the recovered Host failed again inside the crash-loop window.',
      rollback: 'none',
      ...previousPid ? { previousPid } : {},
      port: control.desired.port,
      ...excerpt ? { logExcerpt: excerpt } : {},
    }, now)
    return { action: 'fused', incident }
  }

  const quarantine = transaction ? quarantineCreatorTransaction(root, transaction, now) : undefined
  const nextControl: GuardianControl = {
    ...control,
    consecutiveRecoveries: control.consecutiveRecoveries + 1,
    lastRecoveryAt: iso(now),
  }
  delete nextControl.healthySince
  delete nextControl.unhealthySince
  if (!writeGuardianControlIfCurrent(root, generation, nextControl)) return { action: 'superseded' }

  const recovered = start(root, {
    profile: 'web',
    port: control.desired.port,
    overlay: control.desired.overlay || undefined,
    plugin: control.desired.plugin,
  })
  const healthy = await waitHttp(control.desired.port, 30_000)
  if (!healthy) {
    if (!writeGuardianControlIfCurrent(root, generation, { ...nextControl, enabled: false })) {
      return { action: 'superseded', host: recovered }
    }
    const incident = recordCreatorIncident(root, {
      reason: 'crash-loop',
      confidence,
      sessionIds: sessions,
      ...transaction ? { pluginId: transaction.pluginId, transactionId: transaction.id } : {},
      summary: `Creator+ Guardian restarted pid ${recovered.pid}, but port ${control.desired.port} did not become healthy.`,
      rollback: quarantine?.mode ?? 'none',
      ...previousPid ? { previousPid } : {},
      recoveredPid: recovered.pid,
      port: control.desired.port,
      ...excerpt ? { logExcerpt: excerpt } : {},
    }, now)
    return { action: 'fused', incident, host: recovered }
  }

  const recoveredControl: GuardianControl = {
    ...nextControl,
    desired: {
      ...nextControl.desired!,
      hostPid: recovered.pid,
    },
    healthySince: iso(now),
  }
  if (!writeGuardianControlIfCurrent(root, generation, recoveredControl)) {
    return { action: 'superseded', host: recovered }
  }
  if (transaction) markCreatorTransactionRecovered(root, transaction, now)
  const reason: CreatorIncident['reason'] = pidIsAlive ? 'host-unhealthy' : 'host-exited'
  const incident = recordCreatorIncident(root, {
    reason,
    confidence,
    sessionIds: sessions,
    ...transaction ? { pluginId: transaction.pluginId, transactionId: transaction.id } : {},
    summary: transaction
      ? `Creator+ Guardian quarantined ${transaction.pluginId}, restarted the Web Host, and restored port ${control.desired.port}.`
      : `Creator+ Guardian restored port ${control.desired.port}; no single live transaction could be named as the cause.`,
    rollback: quarantine?.mode ?? 'none',
    ...previousPid ? { previousPid } : {},
    recoveredPid: recovered.pid,
    port: control.desired.port,
    ...excerpt ? { logExcerpt: excerpt } : {},
  }, now)
  return { action: 'restarted', incident, host: recovered }
}

export function guardianCreatorSnapshot(root: string): ReturnType<typeof creatorSnapshot> & { guardian: GuardianStatus } {
  return { ...creatorSnapshot(root), guardian: guardianStatus(root) }
}
