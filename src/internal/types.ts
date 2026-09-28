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

export const DSHX_VERSION = '0.9.2'
/** Official release this desk is proved against. Omitted `update` targets stay here. */
export const DESK_HARNESS_TAG = 'dsh-v0.2.0-rc.1'
/** Commit of {@link DESK_HARNESS_TAG} on deepseek-ai/deepseek-harness. */
export const DESK_HARNESS_SHA = '4878cdabd87d4041bdaff61d04c966883b9fd07a'
/**
 * Peer range for `@deepseek-ai/dsh` and `@deepseek-ai/dsh-*`.
 * Official `apps/cli` package `@deepseek-ai/dsh` at this tag is `0.2.0-rc.1`.
 * Accepts `0.2.0-rc.1` and later `0.2.0` builds below `0.2.1`. Rejects `0.2.0` alphas.
 * `>=0.1.7-rc.1 <0.1.8` does not accept `0.2.0-rc.1`.
 */
export const DSH_PEER_RANGE = '>=0.2.0-rc.1 <0.2.1'
export const DEFAULT_PORT = 3080
export const DEFAULT_TIMEOUT_MS = 60_000
export const DEFAULT_PROFILE: ProfileName = 'web'
export const TEMPLATE_BUNDLES: Record<ProfileName, readonly string[]> = {
  desktop: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
  web: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
  headless: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'],
}
