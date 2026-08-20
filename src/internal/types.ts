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
export type ProfileName = 'web' | 'headless'
export type ActivationChange = 'patch' | 'manifest' | 'preset' | 'client' | 'new-client' | 'server' | 'artifact'

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
  inferred: boolean
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
}

export const DSHX_VERSION = '0.6.0'
export const DEFAULT_PORT = 3080
export const DEFAULT_TIMEOUT_MS = 60_000
export const DEFAULT_PROFILE: ProfileName = 'web'
export const TEMPLATE_BUNDLES: Record<ProfileName, readonly string[]> = {
  web: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
  headless: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'],
}
