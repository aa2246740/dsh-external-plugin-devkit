export type Level = 'ok' | 'info' | 'warn' | 'error'

export interface Finding {
  level: Level
  code: string
  message: string
  hint?: string
  path?: string
}

export interface Report {
  command: string
  ok: boolean
  findings: Finding[]
  data?: object
}

export type PluginKind = 'function' | 'tool' | 'client' | 'object' | 'class'
export type ProfileName = 'web' | 'headless' | 'desktop'
export type HotReloadScope = 'root' | 'preset' | 'mixed'
export type ActivationChange = 'patch' | 'manifest' | 'preset' | 'client' | 'new-client' | 'server' | 'artifact'
export type UpdateAction = 'plan' | 'prepare' | 'verify' | 'apply' | 'rollback'

export interface HotReloadArtifactHash {
  path: string
  before: string
  after: string
}

export interface PluginManifest {
  id: string
  name: string
  dir: string
  entry: string
  entryAbs: string
  marker?: string
  kind: PluginKind
  inject?: string[]
  profile: ProfileName
  config?: Record<string, unknown>
  hotReload?: {
    /** Ordered, exact package-relative source files. The entry is always present. */
    artifacts: string[]
  }
  inferred: boolean
  runtimePackage?: {
    name: string
    manifestPath: string
    webClient: boolean
  }
}

export interface HostState {
  pid: number
  profile: ProfileName
  port: number
  plugin?: string
  overlay: string
  logFile: string
  startedAt: string
  command: string[]
  ownership?: 'spawned' | 'adopted'
  launcherPid?: number
  /** OS process birth token used to reject PID reuse before signaling. */
  processStartedAt?: string
  /** Canonical DSH_HOME and Harness root bound when this Host was discovered. */
  home?: string
  hostRoot?: string
}

export interface CliOptions {
  json: boolean
  profile: ProfileName
  port: number
  timeoutMs: number
  follow: boolean
  grep?: string
  keep: boolean
  force: boolean
  kind: PluginKind
  task?: string
  dryRun: boolean
  printPrompt: boolean
  restart: boolean
  change?: ActivationChange
  harness?: string
  target?: string
  candidate?: string
  pluginSources?: string[]
  scope: HotReloadScope
}

export const DSHX_VERSION = '0.9.7'
/** Official release this desk is proved against. Omitted `update` targets stay here. */
export const DESK_HARNESS_TAG = 'dsh-v0.2.1-rc.2'
/** Commit of {@link DESK_HARNESS_TAG} on deepseek-ai/deepseek-harness. */
export const DESK_HARNESS_SHA = '687f282e8625c6b8d11ff58211a90524be2e4317'
/**
 * Peer / `engines.dsh` range for `@deepseek-ai/dsh` and `@deepseek-ai/dsh-*`.
 * Official `apps/cli` package `@deepseek-ai/dsh` at this tag is `0.2.1-rc.2`.
 * Accepts `0.2.1-rc.1`, `0.2.1-rc.2`, and later `0.2.1` builds below `0.2.2`.
 * Rejects `0.2.1` alphas and the prior `0.2.0` series.
 * `>=0.2.0-rc.1 <0.2.1` does not accept `0.2.1-rc.*`.
 */
export const DSH_PEER_RANGE = '>=0.2.1-rc.1 <0.2.2'
export const DEFAULT_PORT = 3080
export const DEFAULT_TIMEOUT_MS = 60_000
export const DEFAULT_PROFILE: ProfileName = 'web'
export const TEMPLATE_BUNDLES: Record<ProfileName, readonly string[]> = {
  desktop: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
  web: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
  headless: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'],
}
