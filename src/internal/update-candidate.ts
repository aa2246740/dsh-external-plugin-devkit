import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import yaml from 'js-yaml'
import { dumpConfig, duplicateIds, parseDumpEntries } from './dsh.ts'
import { logContains, probePort, startTransientHost, stopTransientHost, waitForHttp, waitForLog } from './host.ts'
import { loadJson, writeText } from './io.ts'
import { renderOverlay } from './overlay.ts'
import { dshxPackageRoot, stateDir } from './paths.ts'
import { loadPlugin } from './plugin.ts'
import { ensureRuntimePackageLink } from './runtime-package.ts'
import type { CliOptions, PluginManifest } from './types.ts'
import { DEFAULT_PORT } from './types.ts'
import { collectUpdatePlan } from './update.ts'
import type { PluginLocation, UpdatePlan, UpdatePluginInventory, UpdateTargetState } from './update.ts'
import { fetchAuthenticatedWebPage, fetchAuthenticatedWebResource, findWebStartupUrl, parseWebBootManifest } from './web-boot.ts'

interface CommandResult {
  ok: boolean
  code: number
  command: string
  stdout: string
  stderr: string
  durationMs: number
}

export interface CandidatePluginResult {
  name: string
  sourcePath: string
  stagedPath: string
  sourceLocation: PluginLocation
  client: boolean
  sourceHash: string
  copied: boolean
  build: boolean
  buildRequired: boolean
  buildLog?: string
  staticCheck?: boolean
  staticLog?: string
  runtime?: boolean
  runtimeLog?: string
  runtimeProof?: 'server-marker' | 'web-client-graph'
  probe?: 'direct-marker' | 'staging-wrapper'
}

export interface CandidateWebGateResult {
  gate: 'vanilla-web' | 'combined-web'
  staticConfig: boolean
  runtime: boolean
  expectedClientPackages: string[]
  graphEntries: number
  servedBundles: number
  logFile: string
  overlay?: string
  reason?: string
  preservedHome?: string
}

const SOURCE_HASH_EXCLUDES = new Set([
  '.git',
  '.dshx',
  '.artifacts',
  'node_modules',
  'lib',
  'dist',
  'coverage',
  'tests',
])

export function pluginSourceHash(root: string): string {
  const hash = createHash('sha256')
  const visit = (path: string): void => {
    const rel = relative(root, path).replaceAll('\\', '/') || '.'
    const name = basename(path)
    if (rel !== '.' && (SOURCE_HASH_EXCLUDES.has(name) || name.startsWith('.dshx-update') || name.endsWith('.tsbuildinfo'))) return
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) {
      hash.update(`L\0${rel}\0${readlinkSync(path)}\0`)
      return
    }
    if (stat.isDirectory()) {
      hash.update(`D\0${rel}\0`)
      for (const entry of readdirSync(path).sort()) visit(join(path, entry))
      return
    }
    if (stat.isFile()) {
      hash.update(`F\0${rel}\0`)
      hash.update(readFileSync(path))
      hash.update('\0')
    }
  }
  visit(root)
  return hash.digest('hex')
}

export interface UpdateCandidateState {
  schemaVersion: 1
  preparedAt: string
  verifiedAt?: string
  sourceRoot: string
  sourceSha: string
  target: UpdateTargetState
  candidateRoot: string
  harnessInstall: boolean
  harnessBuild: boolean
  installLog: string
  buildLog: string
  plugins: CandidatePluginResult[]
  vanillaWeb?: CandidateWebGateResult
  combinedWeb?: CandidateWebGateResult
}

export interface CandidateActionResult {
  state: UpdateCandidateState
  statePath: string
  ok: boolean
}

function safeTag(tag: string): string {
  return tag.replace(/[^0-9A-Za-z._-]/g, '-')
}

export function updateStatePath(root: string, tag: string): string {
  return join(stateDir(root), 'update-assistant', safeTag(tag), 'state.json')
}

function updateLogDir(root: string, tag: string): string {
  return join(stateDir(root), 'update-assistant', safeTag(tag), 'logs')
}

function defaultCandidateRoot(root: string, tag: string): string {
  return join(dirname(root), `${basename(root)}-${safeTag(tag)}-candidate`)
}

function commandText(command: string, args: readonly string[]): string {
  return [command, ...args].map(value => /\s/.test(value) ? JSON.stringify(value) : value).join(' ')
}

function runCommand(
  cwd: string,
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = 20 * 60_000,
): CommandResult {
  const started = Date.now()
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: timeoutMs,
  })
  const code = result.status ?? 1
  return {
    ok: code === 0,
    code,
    command: commandText(command, args),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? (result.error?.message ?? ''),
    durationMs: Date.now() - started,
  }
}

function recordCommand(path: string, result: CommandResult): string {
  writeText(path, [
    `$ ${result.command}`,
    `exit: ${result.code}`,
    `duration_ms: ${result.durationMs}`,
    '',
    result.stdout,
    result.stderr,
  ].join('\n'))
  return path
}

function git(root: string, args: readonly string[], timeoutMs?: number): CommandResult {
  return runCommand(root, 'git', ['-C', root, ...args], process.env, timeoutMs)
}

function requireCommand(result: CommandResult, label: string): void {
  if (result.ok) return
  throw new Error(`${label} failed (${result.code}): ${result.stderr.trim() || result.stdout.trim() || result.command}`)
}

function ensureTarget(root: string, target: UpdateTargetState): void {
  if (!target.local) {
    requireCommand(git(root, ['fetch', '--no-tags', 'origin', `refs/tags/${target.tag}:refs/tags/${target.tag}`]), `fetch ${target.tag}`)
  }
  const resolved = git(root, ['rev-parse', '--verify', `${target.tag}^{commit}`])
  requireCommand(resolved, `resolve ${target.tag}`)
  if (resolved.stdout.trim() !== target.sha) {
    throw new Error(`target tag moved: plan selected ${target.sha}, local tag resolves to ${resolved.stdout.trim()}`)
  }
}

function ensureCandidateWorktree(root: string, target: UpdateTargetState, requested?: string): string {
  const candidate = resolve(requested ?? defaultCandidateRoot(root, target.tag))
  if (candidate === resolve(root)) throw new Error('candidate path must not equal the active Harness checkout')
  if (!existsSync(candidate)) {
    mkdirSync(dirname(candidate), { recursive: true })
    requireCommand(git(root, ['worktree', 'add', '--detach', candidate, target.sha]), 'create candidate worktree')
  }
  const head = git(candidate, ['rev-parse', 'HEAD'])
  requireCommand(head, 'read candidate HEAD')
  if (head.stdout.trim() !== target.sha) {
    throw new Error(`candidate HEAD mismatch: expected ${target.sha}, found ${head.stdout.trim()}`)
  }
  if (!existsSync(join(candidate, 'apps/cli/src/bin.ts'))) {
    throw new Error(`candidate is not a DeepSeek Harness checkout: ${candidate}`)
  }
  return candidate
}

function ensureCandidateDshx(candidate: string): void {
  const source = realpathSync(dshxPackageRoot())
  const tools = join(candidate, 'tools')
  const target = join(tools, 'dshx')
  mkdirSync(tools, { recursive: true })
  if (existsSync(target)) {
    if (!lstatSync(target).isSymbolicLink() || realpathSync(target) !== source) {
      throw new Error(`candidate tools/dshx already exists and is not this devkit: ${target}`)
    }
    return
  }
  symlinkSync(source, target, 'dir')
}

function copyFilter(source: string): boolean {
  const name = basename(source)
  return name !== '.git' && name !== '.dshx' && name !== 'node_modules'
}

function stagePlugin(candidate: string, plugin: UpdatePluginInventory): string {
  const target = join(candidate, 'my-plugins', plugin.name)
  rmSync(target, { recursive: true, force: true })
  mkdirSync(dirname(target), { recursive: true })
  cpSync(plugin.realPath, target, {
    recursive: true,
    dereference: true,
    preserveTimestamps: true,
    filter: copyFilter,
  })
  const bridge = join(candidate, 'node_modules/.pnpm/node_modules')
  if (!existsSync(bridge)) throw new Error(`candidate dependency bridge missing: ${bridge}`)
  symlinkSync(bridge, join(target, 'node_modules'), 'dir')
  return target
}

const TARGET_RUNTIME_DEPENDENCIES = [
  '@deepseek-ai',
  '@earendil-works',
  '@cordisjs',
  'cordis',
  'react',
  'react-dom',
] as const

function replaceWithTargetDependency(candidate: string, pluginDir: string, name: string): void {
  const target = join(candidate, 'node_modules/.pnpm/node_modules', name)
  if (!existsSync(target)) return
  const path = join(pluginDir, 'node_modules', name)
  rmSync(path, { recursive: true, force: true })
  mkdirSync(dirname(path), { recursive: true })
  symlinkSync(target, path, 'dir')
}

function installPluginDependencies(candidate: string, pluginDir: string, env: NodeJS.ProcessEnv): CommandResult {
  rmSync(join(pluginDir, 'node_modules'), { recursive: true, force: true })
  const installed = runCommand(pluginDir, 'pnpm', ['install', '--ignore-workspace', '--frozen-lockfile', '--ignore-scripts'], env)
  if (!installed.ok) return installed
  for (const name of TARGET_RUNTIME_DEPENDENCIES) replaceWithTargetDependency(candidate, pluginDir, name)
  return installed
}

function packageBuildScript(pluginDir: string): string | undefined {
  const path = join(pluginDir, 'package.json')
  if (!existsSync(path)) return undefined
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const scripts = Reflect.get(parsed, 'scripts')
  if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) return undefined
  const build = Reflect.get(scripts, 'build')
  return typeof build === 'string' ? build : undefined
}

function candidateEnv(candidate: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const bins = join(candidate, 'node_modules/.bin')
  return {
    ...process.env,
    ...extra,
    CI: '1',
    LEFTHOOK: '0',
    DSHX_HARNESS: candidate,
    PATH: `${bins}:${process.env.PATH ?? ''}`,
  }
}

function candidateCli(candidate: string, args: readonly string[], env: NodeJS.ProcessEnv, timeoutMs: number): CommandResult {
  return runCommand(candidate, process.execPath, [
    '--import', 'tsx/esm', join(candidate, 'tools/dshx/src/cli.ts'),
    ...args,
    '--harness', candidate,
    '--json',
  ], env, timeoutMs)
}

function reportFindingOk(result: CommandResult, code: string, message?: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    return false
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.findings)) return false
  return parsed.findings.some(value => isRecord(value)
    && value.level === 'ok'
    && value.code === code
    && (message === undefined || value.message === message))
}

function wrapperImport(from: string, target: string): string {
  const path = relative(from, target).replaceAll('\\', '/')
  return path.startsWith('.') ? path : `./${path}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function candidateWebOverlay(candidate: string, gate: CandidateWebGateResult['gate'], plugins: readonly PluginManifest[]): string | undefined {
  if (plugins.length === 0) return undefined
  const path = join(candidate, '.dshx', 'update-probes', gate, 'cordis.yml')
  writeText(path, plugins.map(renderOverlay).join('\n'))
  return path
}

function webGateError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function verifyCandidateWebGate(
  candidate: string,
  gate: CandidateWebGateResult['gate'],
  pluginNames: readonly string[],
  port: number,
  timeoutMs: number,
  logDir: string,
): Promise<CandidateWebGateResult> {
  const isolatedHome = mkdtempSync(join(tmpdir(), `dshx-update-${gate}-`))
  const env = candidateEnv(candidate, { DSH_HOME: isolatedHome })
  const logFile = join(logDir, `${gate}.log`)
  let staticConfig = false
  let runtime = false
  let graphEntries = 0
  let servedBundles = 0
  let expectedClientPackages: string[] = []
  let overlay: string | undefined
  let reason: string | undefined
  let cleanupHome = true
  let transient: ReturnType<typeof startTransientHost> | undefined
  try {
    const plugins = pluginNames.map(name => loadPlugin(candidate, name))
    expectedClientPackages = [...new Set(plugins.flatMap(plugin => plugin.runtimePackage?.webClient ? [plugin.runtimePackage.name] : []))]
    const profile = dumpConfig(candidate, 'web', [], env)
    if (profile.code !== 0) throw new Error(`temporary Web profile initialization exited ${profile.code}`)
    for (const plugin of plugins) ensureRuntimePackageLink(plugin, isolatedHome, 'web')
    const baseEntries = parseDumpEntries(profile.stdout)
    const baseIds = new Set(baseEntries.filter(entry => entry.disabled !== true).map(entry => entry.id))
    overlay = candidateWebOverlay(candidate, gate, plugins.filter(plugin => !baseIds.has(plugin.id)))
    const composed = overlay ? dumpConfig(candidate, 'web', [overlay], env) : profile
    if (composed.code !== 0) throw new Error(`combined temporary dump-config exited ${composed.code}`)
    const entries = parseDumpEntries(composed.stdout)
    const missing = plugins.filter(plugin => !entries.some(entry => entry.id === plugin.id && entry.disabled !== true)).map(plugin => plugin.id)
    const duplicates = duplicateIds(entries)
    if (missing.length > 0) throw new Error(`temporary composed tree is missing plugin ids: ${missing.join(', ')}`)
    if (duplicates.length > 0) throw new Error(`temporary composed tree has duplicate ids: ${duplicates.join(', ')}`)
    staticConfig = true

    if (await probePort(port) !== 'closed') throw new Error(`port ${port} is busy or cannot be proved free for ${gate}`)
    transient = startTransientHost(candidate, {
      profile: 'web',
      port,
      overlay,
      env,
      logFile,
    })
    if (!await waitForHttp(port, timeoutMs)) throw new Error(`temporary Web Host did not accept HTTP within ${timeoutMs}ms`)
    if (!await waitForLog(logFile, 'dsh web:', timeoutMs)) throw new Error(`temporary Web Host did not print a ready URL within ${timeoutMs}ms`)
    const startupUrl = findWebStartupUrl(readFileSync(logFile, 'utf8'), port)
    if (!startupUrl) throw new Error(`temporary Web Host did not print a valid local startup URL for port ${port}`)
    const page = await fetchAuthenticatedWebPage(startupUrl)
    const manifest = parseWebBootManifest(page.html)
    if (!manifest) throw new Error('authenticated temporary Web page is missing globalThis["__DSH_BOOT__"]')
    graphEntries = manifest.entries.length
    const missingPackages = expectedClientPackages.filter(name => !manifest.entries.some(entry => entry.id === name))
    if (missingPackages.length > 0) throw new Error(`temporary __DSH_BOOT__ is missing client packages: ${missingPackages.join(', ')}`)
    for (const name of expectedClientPackages) {
      const entry = manifest.entries.find(candidateEntry => candidateEntry.id === name)
      if (!entry) continue
      const response = await fetchAuthenticatedWebResource(page, entry.url)
      const bytes = Buffer.byteLength(await response.text())
      if (!response.ok || bytes === 0) throw new Error(`${entry.url} returned ${response.status} (${bytes} bytes)`)
      servedBundles += 1
    }
    const brickPhrase = [
      'duplicate loader entry id',
      'Failed to load plugins',
      'cannot resolve profile bundle',
    ].find(phrase => logContains(logFile, phrase))
    if (brickPhrase) throw new Error(`temporary Web Host log contains ${JSON.stringify(brickPhrase)}`)
    runtime = true
  } catch (error) {
    reason = webGateError(error)
  } finally {
    if (transient) {
      try {
        await stopTransientHost(transient)
      } catch (error) {
        cleanupHome = false
        const stopReason = `temporary Web Host could not be proved stopped: ${webGateError(error)}`
        reason = reason ? `${reason}; ${stopReason}` : stopReason
      }
    }
    if (cleanupHome) rmSync(isolatedHome, { recursive: true, force: true })
  }
  return {
    gate,
    staticConfig,
    runtime,
    expectedClientPackages,
    graphEntries,
    servedBundles,
    logFile,
    ...overlay ? { overlay } : {},
    ...reason ? { reason } : {},
    ...cleanupHome ? {} : { preservedHome: isolatedHome },
  }
}

export function createApplyProbe(candidate: string, name: string): { dir: string; marker: string } {
  const plugin = loadPlugin(candidate, name)
  const dir = join(candidate, '.dshx', 'update-probes', name)
  const sourceDir = join(dir, 'src')
  const entry = join(sourceDir, 'probe.ts')
  const specifier = wrapperImport(sourceDir, plugin.entryAbs)
  const marker = `[dshx-update:${plugin.id}] apply-ok`
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(sourceDir, { recursive: true })
  writeText(entry, [
    `import * as original from ${JSON.stringify(specifier)}`,
    `export * from ${JSON.stringify(specifier)}`,
    '',
    'export function apply(ctx: unknown, config: unknown): unknown {',
    '  const result = original.apply(ctx, config)',
    "  if (result && typeof result === 'object' && 'then' in result) {",
    '    return Promise.resolve(result).then(value => {',
    `      console.log(${JSON.stringify(marker)})`,
    '      return value',
    '    })',
    '  }',
    `  console.log(${JSON.stringify(marker)})`,
    '  return result',
    '}',
    '',
  ].join('\n'))
  writeText(join(dir, 'dshx.yml'), yaml.dump({
    id: plugin.id,
    entry: 'src/probe.ts',
    marker,
    kind: 'function',
    inject: plugin.inject,
    profile: plugin.profile,
    config: plugin.config,
  }, { noRefs: true, lineWidth: 120 }))
  const packagePath = join(plugin.dir, 'package.json')
  if (existsSync(packagePath)) {
    const parsed: unknown = JSON.parse(readFileSync(packagePath, 'utf8'))
    if (!isRecord(parsed)) throw new Error(`plugin package must hold an object: ${packagePath}`)
    const dsh = isRecord(parsed.dsh) ? parsed.dsh : undefined
    const client = dsh && isRecord(dsh.client) ? dsh.client : undefined
    if (client?.platform === 'web') {
      if (typeof parsed.name !== 'string' || parsed.name.length === 0) {
        throw new Error(`web client probe needs package.json name: ${packagePath}`)
      }
      if (!isRecord(parsed.exports) || !('./client' in parsed.exports)) {
        throw new Error(`web client probe needs package.json exports["./client"]: ${packagePath}`)
      }
      const lib = join(plugin.dir, 'lib')
      if (!existsSync(lib)) throw new Error(`web client probe needs built lib/: ${lib}`)
      symlinkSync(lib, join(dir, 'lib'), 'dir')
      writeText(join(dir, 'package.json'), `${JSON.stringify({
        ...parsed,
        main: './src/probe.ts',
        exports: {
          ...parsed.exports,
          '.': './src/probe.ts',
          './package.json': './package.json',
        },
      }, null, 2)}\n`)
    }
  }
  return { dir, marker }
}

export function loadUpdateCandidateState(root: string, target: string): UpdateCandidateState {
  const path = updateStatePath(root, target)
  if (!existsSync(path)) throw new Error(`candidate state missing: run dshx update prepare --target ${target} first`)
  const state = loadJson<UpdateCandidateState>(path)
  if (state.schemaVersion !== 1 || state.sourceRoot !== resolve(root) || state.target.tag !== target) {
    throw new Error(`candidate state does not belong to ${root} and ${target}: ${path}`)
  }
  return state
}

export function prepareUpdateCandidate(root: string, options: CliOptions): CandidateActionResult {
  let plan = collectUpdatePlan(root, options.target)
  if (plan.blockers.length > 0) throw new Error(`update plan has blockers: ${plan.blockers.join('; ')}`)
  ensureTarget(root, plan.target)
  if (!plan.target.local) plan = collectUpdatePlan(root, plan.target.tag)
  const candidate = ensureCandidateWorktree(root, plan.target, options.candidate)
  ensureCandidateDshx(candidate)
  const logDir = updateLogDir(root, plan.target.tag)
  const env = candidateEnv(candidate)
  const priorPath = updateStatePath(root, plan.target.tag)
  const prior = existsSync(priorPath) ? loadJson<UpdateCandidateState>(priorPath) : undefined
  const reuseHarness = prior?.target.sha === plan.target.sha
    && prior.candidateRoot === candidate
    && prior.harnessInstall
    && prior.harnessBuild
    && existsSync(join(candidate, 'node_modules/.pnpm/node_modules'))
  let installLog = prior?.installLog ?? join(logDir, 'harness-install.log')
  let buildLog = prior?.buildLog ?? join(logDir, 'harness-build.log')
  if (!reuseHarness) {
    const install = runCommand(candidate, 'pnpm', ['install', '--frozen-lockfile'], env)
    installLog = recordCommand(join(logDir, 'harness-install.log'), install)
    if (!install.ok) throw new Error(`candidate dependency install failed; see ${installLog}`)
    const build = runCommand(candidate, 'pnpm', ['run', 'build'], env)
    buildLog = recordCommand(join(logDir, 'harness-build.log'), build)
    if (!build.ok) throw new Error(`candidate Harness build failed; see ${buildLog}`)
  }

  const plugins: CandidatePluginResult[] = []
  for (const item of plan.plugins) {
    const sourceHash = pluginSourceHash(item.realPath)
    const previous = prior?.plugins.find(plugin => plugin.name === item.name)
    if (previous?.build && existsSync(previous.stagedPath) && sourceHash === pluginSourceHash(previous.stagedPath)) {
      plugins.push({
        ...previous,
        sourcePath: item.realPath,
        sourceLocation: item.location,
        client: item.client,
        sourceHash,
      })
      continue
    }
    const stagedPath = stagePlugin(candidate, item)
    const script = packageBuildScript(stagedPath)
    let buildOk = true
    let pluginLog: string | undefined
    if (script) {
      let result = runCommand(stagedPath, '/bin/sh', ['-c', script], env)
      pluginLog = recordCommand(join(logDir, `${item.name}-build.log`), result)
      if (!result.ok) {
        const installed = installPluginDependencies(candidate, stagedPath, env)
        recordCommand(join(logDir, `${item.name}-dependencies.log`), installed)
        if (installed.ok) {
          result = runCommand(stagedPath, '/bin/sh', ['-c', script], env)
          pluginLog = recordCommand(join(logDir, `${item.name}-build-retry.log`), result)
        }
      }
      buildOk = result.ok
    }
    plugins.push({
      name: item.name,
      sourcePath: item.realPath,
      stagedPath,
      sourceLocation: item.location,
      client: item.client,
      sourceHash,
      copied: true,
      build: buildOk,
      buildRequired: Boolean(script),
      ...pluginLog ? { buildLog: pluginLog } : {},
    })
  }
  const state: UpdateCandidateState = {
    schemaVersion: 1,
    preparedAt: new Date().toISOString(),
    sourceRoot: resolve(root),
    sourceSha: plan.checkout.sha,
    target: plan.target,
    candidateRoot: candidate,
    harnessInstall: true,
    harnessBuild: true,
    installLog,
    buildLog,
    plugins,
  }
  const statePath = updateStatePath(root, plan.target.tag)
  writeText(statePath, `${JSON.stringify(state, null, 2)}\n`)
  return { state, statePath, ok: plugins.every(plugin => plugin.build) }
}

export async function verifyUpdateCandidate(root: string, options: CliOptions): Promise<CandidateActionResult> {
  const plan = collectUpdatePlan(root, options.target)
  const state = loadUpdateCandidateState(root, plan.target.tag)
  if (options.candidate && resolve(options.candidate) !== state.candidateRoot) {
    throw new Error(`--candidate does not match prepared state: ${options.candidate} != ${state.candidateRoot}`)
  }
  const head = git(state.candidateRoot, ['rev-parse', 'HEAD'])
  requireCommand(head, 'read candidate HEAD')
  if (head.stdout.trim() !== state.target.sha) throw new Error('candidate HEAD changed after prepare')
  const port = options.port === DEFAULT_PORT ? 43160 : options.port
  const timeoutSeconds = Math.max(1, Math.ceil(options.timeoutMs / 1000))
  const logDir = updateLogDir(root, state.target.tag)
  const vanillaWeb = await verifyCandidateWebGate(state.candidateRoot, 'vanilla-web', [], port, options.timeoutMs, logDir)
  const plugins: CandidatePluginResult[] = []
  for (const item of state.plugins) {
    const currentProof = item.client ? 'web-client-graph' : 'server-marker'
    if (item.build && item.staticCheck === true && item.runtime === true && item.runtimeProof === currentProof) {
      plugins.push(item)
      continue
    }
    const env = candidateEnv(state.candidateRoot, {
      DSH_HOME: join(state.candidateRoot, '.dshx', 'update-home', item.name),
    })
    const checked = candidateCli(state.candidateRoot, ['check', item.name], env, options.timeoutMs)
    const staticLog = recordCommand(join(logDir, `${item.name}-check.log`), checked)
    let runtime = false
    let runtimeLog: string | undefined
    if (item.build && checked.ok) {
      const probe = createApplyProbe(state.candidateRoot, item.name)
      const booted = candidateCli(state.candidateRoot, [
        'verify-boot', probe.dir,
        '--profile', 'web',
        '--port', String(port),
        '--timeout', String(timeoutSeconds),
      ], env, options.timeoutMs + 30_000)
      runtimeLog = recordCommand(join(logDir, `${item.name}-runtime.log`), booted)
      runtime = item.client
        ? booted.ok
          && reportFindingOk(booted, 'client-graph')
          && reportFindingOk(booted, 'client-http')
        : booted.ok && reportFindingOk(booted, 'boot-marker', `startup log contains ${probe.marker}`)
    }
    plugins.push({
      ...item,
      staticCheck: checked.ok,
      staticLog,
      runtime,
      ...runtime ? { runtimeProof: currentProof } : {},
      ...runtimeLog ? { runtimeLog } : {},
      probe: 'staging-wrapper',
    })
  }
  const combinedWeb = await verifyCandidateWebGate(state.candidateRoot, 'combined-web', state.plugins.map(plugin => plugin.name), port, options.timeoutMs, logDir)
  const verified: UpdateCandidateState = {
    ...state,
    verifiedAt: new Date().toISOString(),
    plugins,
    vanillaWeb,
    combinedWeb,
  }
  const statePath = updateStatePath(root, state.target.tag)
  writeText(statePath, `${JSON.stringify(verified, null, 2)}\n`)
  return {
    state: verified,
    statePath,
    ok: candidateVerified(verified),
  }
}

export function candidateSummary(plan: UpdatePlan, result: CandidateActionResult): Record<string, unknown> {
  return {
    current: { version: plan.checkout.version, sha: plan.checkout.sha },
    target: result.state.target,
    candidateRoot: result.state.candidateRoot,
    statePath: result.statePath,
    harness: { install: result.state.harnessInstall, build: result.state.harnessBuild },
    web: {
      vanilla: result.state.vanillaWeb,
      combined: result.state.combinedWeb,
    },
    plugins: result.state.plugins.map(plugin => ({
      name: plugin.name,
      sourceLocation: plugin.sourceLocation,
      client: plugin.client,
      copied: plugin.copied,
      build: plugin.build,
      staticCheck: plugin.staticCheck,
      runtime: plugin.runtime,
      runtimeProof: plugin.runtimeProof,
      probe: plugin.probe,
    })),
  }
}

export function candidateFailures(state: UpdateCandidateState): CandidatePluginResult[] {
  return state.plugins.filter(plugin => !plugin.build || plugin.staticCheck === false || plugin.runtime === false)
}

export function candidateWebGateFailures(state: UpdateCandidateState): string[] {
  const gates: readonly [CandidateWebGateResult['gate'], CandidateWebGateResult | undefined][] = [
    ['vanilla-web', state.vanillaWeb],
    ['combined-web', state.combinedWeb],
  ]
  return gates.filter(([, gate]) => gate?.staticConfig !== true || gate.runtime !== true).map(([name]) => name)
}

export function candidateVerified(state: UpdateCandidateState): boolean {
  return state.plugins.every(plugin => plugin.build
    && plugin.staticCheck === true
    && plugin.runtime === true
    && plugin.runtimeProof === (plugin.client ? 'web-client-graph' : 'server-marker'))
    && candidateWebGateFailures(state).length === 0
}

export function candidatePluginNames(candidate: string): string[] {
  const dir = join(candidate, 'my-plugins')
  return existsSync(dir) ? readdirSync(dir).filter(name => !name.startsWith('.')).sort() : []
}
