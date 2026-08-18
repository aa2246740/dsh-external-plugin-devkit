import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import yaml from 'js-yaml'
import type { CliOptions, Finding, Level, PluginKind, ProfileName, Report } from './types.ts'
import { DEFAULT_PORT, DEFAULT_PROFILE, DEFAULT_TIMEOUT_MS } from './types.ts'

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

export function readText(path: string): string {
  return readFileSync(path, 'utf8')
}

export function writeText(path: string, text: string): void {
  ensureDir(dirname(path))
  writeFileSync(path, text)
}

export function loadJson<T>(path: string): T {
  return JSON.parse(readText(path)) as T
}

export function loadYaml(text: string): unknown {
  return yaml.load(text)
}

export function yamlScalar(value: string): string {
  return JSON.stringify(value)
}

/** Load KEY=VALUE pairs. Never log values. */
export function loadDotEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const raw of readText(path).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const cut = line.indexOf('=')
    if (cut <= 0) continue
    const key = line.slice(0, cut).trim()
    let value = line.slice(cut + 1)
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

export function envHas(name: string, extra?: Record<string, string>): boolean {
  const value = extra?.[name] ?? process.env[name]
  return Boolean(value && value.trim())
}

const VALUE_FLAGS = new Set(['--profile', '--port', '--timeout', '--grep', '--kind', '--task', '--harness'])

const COMMAND_FLAGS: Record<string, ReadonlySet<string>> = {
  kb: new Set(['--json']),
  okf: new Set(['--json']),
  init: new Set(['--json', '--force', '--kind']),
  check: new Set(['--json']),
  overlay: new Set(['--json']),
  dump: new Set(['--json', '--profile']),
  start: new Set(['--json', '--profile', '--port', '--timeout', '--keep', '--force', '--task']),
  stop: new Set(['--json']),
  restart: new Set(['--json', '--profile', '--port', '--timeout', '--keep', '--force', '--task']),
  status: new Set(['--json', '--port', '--profile']),
  logs: new Set(['--json', '--follow', '-f', '--grep', '--profile']),
  verify: new Set(['--json', '--profile', '--port', '--timeout', '--keep', '--force', '--task']),
  doctor: new Set(['--json', '--profile']),
  session: new Set(['--json']),
  which: new Set(['--json']),
  experiment: new Set(['--json']),
  setup: new Set(['--json', '--dry-run', '--print-prompt', '--harness', '--force']),
  ship: new Set(['--json', '--profile', '--restart', '--force']),
  recopy: new Set(['--json', '--profile', '--restart', '--force']),
  help: new Set(['--json']),
  loop: new Set(['--json']),
  version: new Set(['--json']),
}

function findCommand(argv: string[]): { command: string; index: number } {
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!
    if (token === '--') return { command: argv[i + 1] ?? 'help', index: i + 1 }
    if (token.startsWith('-')) {
      if (VALUE_FLAGS.has(token)) i += 1
      continue
    }
    return { command: token, index: i }
  }
  return { command: 'help', index: -1 }
}

function applyFlag(token: string, argv: string[], index: number, options: CliOptions): number {
  if (token === '--json') options.json = true
  else if (token === '--follow' || token === '-f') options.follow = true
  else if (token === '--keep') options.keep = true
  else if (token === '--force') options.force = true
  else if (token === '--dry-run') options.dryRun = true
  else if (token === '--print-prompt') options.printPrompt = true
  else if (token === '--restart') options.restart = true
  else if (token === '--harness' && argv[index + 1]) {
    options.harness = argv[index + 1]
    return index + 1
  }
  else if (token === '--profile' && argv[index + 1]) {
    options.profile = argv[index + 1] as ProfileName
    return index + 1
  } else if (token === '--port' && argv[index + 1]) {
    options.port = Number(argv[index + 1])
    return index + 1
  } else if (token === '--timeout' && argv[index + 1]) {
    options.timeoutMs = Number(argv[index + 1]) * 1000
    return index + 1
  } else if (token === '--grep' && argv[index + 1]) {
    options.grep = argv[index + 1]
    return index + 1
  } else if (token === '--kind' && argv[index + 1]) {
    options.kind = argv[index + 1] as PluginKind
    return index + 1
  } else if (token === '--task' && argv[index + 1]) {
    options.task = argv[index + 1]
    return index + 1
  }
  return index
}

/**
 * Flags are command-scoped. `dshx kb search --keep` is a query, not verify's
 * `--keep`. Global `--json` still works. `--` ends option parsing.
 */
export function parseCli(argv: string[]): { command: string; args: string[]; options: CliOptions } {
  const options: CliOptions = {
    json: false,
    profile: DEFAULT_PROFILE,
    port: DEFAULT_PORT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    follow: false,
    keep: false,
    force: false,
    kind: 'function',
    dryRun: false,
    printPrompt: false,
    restart: false,
  }
  const { command: found, index: commandIndex } = findCommand(argv)
  const allowed = COMMAND_FLAGS[found] ?? new Set(['--json'])
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!
    if (token === '--') {
      rest.push(...argv.slice(i + 1))
      break
    }
    if (token.startsWith('-') && allowed.has(token)) {
      i = applyFlag(token, argv, i, options)
      continue
    }
    if (commandIndex >= 0 && i < commandIndex && token.startsWith('-')) {
      if (VALUE_FLAGS.has(token)) i += 1
      continue
    }
    rest.push(token)
  }
  const command = rest[0] ?? 'help'
  return { command, args: rest.slice(1), options }
}

export function finding(level: Level, code: string, message: string, extra: Partial<Finding> = {}): Finding {
  return { level, code, message, ...extra }
}

export function report(command: string, findings: Finding[], data?: Record<string, unknown> | object): Report {
  return {
    command,
    ok: !findings.some(item => item.level === 'error'),
    findings,
    ...data ? { data } : {},
  }
}

const ICONS: Record<Level, string> = {
  ok: 'OK   ',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
}

export function printReport(result: Report, asJson: boolean): void {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }
  process.stdout.write(`dshx ${result.command}\n`)
  for (const item of result.findings) {
    const loc = item.path ? `  ${item.path}` : ''
    process.stdout.write(`${ICONS[item.level]}  ${item.code.padEnd(22)} ${item.message}${loc}\n`)
    if (item.hint) process.stdout.write(`      hint: ${item.hint}\n`)
  }
  if (result.data && Object.keys(result.data).length > 0) {
    process.stdout.write('\n')
    for (const [key, value] of Object.entries(result.data)) {
      if (typeof value === 'string' && value.includes('\n')) {
        process.stdout.write(`${key}:\n${value.replace(/^/gm, '  ')}\n`)
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        process.stdout.write(`${key}: ${value}\n`)
      } else {
        process.stdout.write(`${key}: ${JSON.stringify(value, null, 2)}\n`)
      }
    }
  }
}

export function exitCode(result: Report): number {
  return result.ok ? 0 : 1
}
