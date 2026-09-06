import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export type HotReloadJournalStage =
  | 'prepared'
  | 'mounting-scope'
  | 'waiting-ready'
  | 'ready'
  | 'trigger-requested'
  | 'waiting-module-reload'
  | 'module-reloaded'
  | 'removing-hmr'
  | 'waiting-hmr-disposed'
  | 'hmr-disposed'
  | 'removing-observer'
  | 'waiting-observer-disposed'
  | 'succeeded'
  | 'failed'

export type HotReloadCleanupState = 'not-mounted' | 'mounted' | 'removal-requested' | 'disposed' | 'unknown'

export interface HotReloadJournalRecord {
  version: 1
  kind: 'server-hot-reload'
  transactionId: string
  status: 'running' | 'succeeded' | 'failed'
  stage: HotReloadJournalStage
  startedAt: string
  updatedAt: string
  automaticRecovery: false
  host: {
    pid: number
    processStartedAt: string
    port: number
    profile: 'web'
    home: string
    root: string
  }
  target: {
    pluginId: string
    targetScope: 'root' | 'preset'
    sourcePath: string
    entryPath: string
    patchPath: string
    hmrEntryId: string
    observerEntryId: string
    watchRoots: string[]
    artifactHashes: Array<{ path: string; before: string }>
  }
  cleanup: {
    marker: 'absent' | 'full' | 'observer-only' | 'unknown'
    hmr: HotReloadCleanupState
    observer: HotReloadCleanupState
    proved: boolean
  }
  evidence?: {
    ready?: {
      at: string
      targetGenerationIds: string[]
      targetGenerationStates: Array<{ generationId: string; state: 'ACTIVE' | 'FAILED' }>
      hmrGenerationId: string
    }
    moduleReloaded?: {
      at: string
      hmrEventAt: string
      oldGenerationIds: string[]
      newGenerationIds: string[]
      hmrEventMatchedGenerationIds: string[]
      samePid: true
      artifactHashes: Array<{ path: string; before: string; after: string }>
    }
    hmrDisposed?: { at: string; generationId: string }
    observerDisposed?: { at: string }
  }
  failure?: {
    at: string
    code: 'HOT_RELOAD_FAILED'
    stage: Exclude<HotReloadJournalStage, 'failed' | 'succeeded'>
  }
}

export function hotReloadJournalPath(root: string, transactionId: string): string {
  return join(resolve(root), '.dshx', 'hot-reload', 'transactions', `${transactionId}.json`)
}

/** Atomic evidence only. Guardian deliberately does not consume this namespace. */
export function writeHotReloadJournal(root: string, record: HotReloadJournalRecord): string {
  const path = hotReloadJournalPath(root, record.transactionId)
  mkdirSync(dirname(path), { recursive: true })
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
    throw new Error('hot-reload journal path is a symlink')
  }
  const temporary = join(dirname(path), `.${record.transactionId}.${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    renameSync(temporary, path)
    chmodSync(path, 0o600)
  } finally {
    rmSync(temporary, { force: true })
  }
  return path
}
