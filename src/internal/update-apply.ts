import { spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { currentHost } from './host.ts'
import { loadJson, writeText } from './io.ts'
import { stateDir } from './paths.ts'
import type { CliOptions } from './types.ts'
import { collectUpdatePlan } from './update.ts'
import { loadUpdateCandidateState, pluginSourceHash } from './update-candidate.ts'
import type { CandidatePluginResult, UpdateCandidateState } from './update-candidate.ts'

interface CommandResult {
  ok: boolean
  code: number
  command: string
  stdout: string
  stderr: string
  durationMs: number
}

interface PathBackup {
  original: string
  backup: string
  existed: boolean
}

interface PluginBackup {
  name: string
  sourcePath: string
  nodeModules: PathBackup
  lib: PathBackup
}

export interface UpdateRollbackState {
  schemaVersion: 1
  status: 'prepared' | 'applied' | 'rolled-back' | 'auto-rolled-back'
  createdAt: string
  updatedAt: string
  sourceRoot: string
  original: {
    branch: string
    sha: string
    version: string
  }
  target: {
    tag: string
    sha: string
    version: string
  }
  updateBranch: string
  candidateStatePath: string
  backupRoot: string
  rootNodeModules: PathBackup
  plugins: PluginBackup[]
  applyError?: string
}

export interface UpdateApplyResult {
  ok: boolean
  rollbackPath: string
  state: UpdateRollbackState
  pluginBuilds: Record<string, boolean>
  pluginChecks: Record<string, boolean>
}

const TARGET_RUNTIME_DEPENDENCIES = [
  '@deepseek-ai',
  '@earendil-works',
  '@cordisjs',
  'cordis',
  'react',
  'react-dom',
] as const

function pathPresent(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

function safeTag(tag: string): string {
  return tag.replace(/[^0-9A-Za-z._-]/g, '-')
}

export function rollbackStatePath(root: string, tag: string): string {
  return join(stateDir(root), 'update-assistant', safeTag(tag), 'rollback.json')
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
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
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

function requireCommand(result: CommandResult, label: string): void {
  if (result.ok) return
  throw new Error(`${label} failed (${result.code}): ${result.stderr.trim() || result.stdout.trim() || result.command}`)
}

function git(root: string, args: readonly string[]): CommandResult {
  return runCommand(root, 'git', ['-C', root, ...args])
}

function assertCandidateGate(root: string, options: CliOptions): UpdateCandidateState {
  const plan = collectUpdatePlan(root, options.target)
  if (plan.blockers.length > 0) throw new Error(`update plan has blockers: ${plan.blockers.join('; ')}`)
  const state = loadUpdateCandidateState(root, plan.target.tag)
  if (state.sourceSha !== plan.checkout.sha) {
    throw new Error(`active Harness moved after prepare: ${state.sourceSha} != ${plan.checkout.sha}`)
  }
  if (state.target.sha !== plan.target.sha) throw new Error('prepared target no longer matches the selected release')
  if (!state.verifiedAt || state.plugins.some(plugin => !plugin.build
    || plugin.staticCheck !== true
    || plugin.runtime !== true
    || plugin.runtimeProof !== (plugin.client ? 'web-client-graph' : 'server-marker'))) {
    throw new Error(`candidate gate is incomplete: run dshx update verify --target ${plan.target.tag}`)
  }
  for (const plugin of state.plugins) {
    const sourceHash = pluginSourceHash(plugin.sourcePath)
    const stagedHash = pluginSourceHash(plugin.stagedPath)
    if (sourceHash !== stagedHash) {
      throw new Error(`${plugin.name} changed after candidate preparation; rerun update prepare and update verify`)
    }
  }
  return state
}

function backupOf(original: string, backup: string): PathBackup {
  return { original, backup, existed: pathPresent(original) }
}

function persistRollback(path: string, state: UpdateRollbackState): void {
  state.updatedAt = new Date().toISOString()
  writeText(path, `${JSON.stringify(state, null, 2)}\n`)
}

function moveToBackup(item: PathBackup): void {
  if (!item.existed) return
  mkdirSync(dirname(item.backup), { recursive: true })
  if (pathPresent(item.backup)) throw new Error(`rollback backup already exists: ${item.backup}`)
  renameSync(item.original, item.backup)
}

function linkEntry(source: string, target: string): void {
  const stat = lstatSync(source)
  symlinkSync(source, target, stat.isDirectory() ? 'dir' : 'file')
}

function targetDependency(root: string, name: string): string | undefined {
  const bridge = join(root, 'node_modules/.pnpm/node_modules', name)
  if (pathPresent(bridge)) return bridge
  const direct = join(root, 'node_modules', name)
  return pathPresent(direct) ? direct : undefined
}

function createPluginDependencyView(root: string, backup: PathBackup): void {
  const target = backup.original
  if (!backup.existed || lstatSync(backup.backup).isSymbolicLink()) {
    symlinkSync(join(root, 'node_modules/.pnpm/node_modules'), target, 'dir')
    return
  }
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(backup.backup)) {
    linkEntry(join(backup.backup, entry), join(target, entry))
  }
  for (const name of TARGET_RUNTIME_DEPENDENCIES) {
    const source = targetDependency(root, name)
    if (!source) continue
    const path = join(target, name)
    rmSync(path, { recursive: true, force: true })
    mkdirSync(dirname(path), { recursive: true })
    symlinkSync(source, path, 'dir')
  }
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

function restorePath(item: PathBackup): void {
  if (pathPresent(item.backup)) {
    rmSync(item.original, { recursive: true, force: true })
    mkdirSync(dirname(item.original), { recursive: true })
    renameSync(item.backup, item.original)
    return
  }
  if (!item.existed) rmSync(item.original, { recursive: true, force: true })
}

function restoreTransaction(state: UpdateRollbackState): void {
  for (const plugin of [...state.plugins].reverse()) {
    restorePath(plugin.lib)
    restorePath(plugin.nodeModules)
  }
  restorePath(state.rootNodeModules)
  if (state.original.branch === '(detached)') {
    requireCommand(git(state.sourceRoot, ['switch', '--detach', state.original.sha]), 'restore original detached checkout')
  } else {
    requireCommand(git(state.sourceRoot, ['switch', state.original.branch]), 'restore original branch')
    const head = git(state.sourceRoot, ['rev-parse', 'HEAD'])
    requireCommand(head, 'read restored HEAD')
    if (head.stdout.trim() !== state.original.sha) {
      throw new Error(`original branch moved during update: expected ${state.original.sha}, found ${head.stdout.trim()}`)
    }
  }
}

function updateBranchName(tag: string): string {
  return `dshx/${safeTag(tag)}`
}

function switchToTarget(root: string, branch: string, sha: string): void {
  const existing = git(root, ['rev-parse', '--verify', `refs/heads/${branch}`])
  if (existing.ok) {
    if (existing.stdout.trim() !== sha) throw new Error(`update branch ${branch} exists at a different commit`)
    requireCommand(git(root, ['switch', branch]), `switch ${branch}`)
    return
  }
  requireCommand(git(root, ['switch', '-c', branch, sha]), `create ${branch}`)
}

function pluginBackups(state: UpdateCandidateState, backupRoot: string): PluginBackup[] {
  return state.plugins.map(plugin => {
    const root = join(backupRoot, 'plugins', plugin.name)
    return {
      name: plugin.name,
      sourcePath: plugin.sourcePath,
      nodeModules: backupOf(join(plugin.sourcePath, 'node_modules'), join(root, 'node_modules')),
      lib: backupOf(join(plugin.sourcePath, 'lib'), join(root, 'lib')),
    }
  })
}

function cliCheck(root: string, plugin: CandidatePluginResult, env: NodeJS.ProcessEnv): CommandResult {
  return runCommand(root, process.execPath, [
    '--import', 'tsx/esm', join(root, 'tools/dshx/src/cli.ts'),
    'check', plugin.name,
    '--harness', root,
    '--json',
  ], env)
}

export function applyUpdate(root: string, options: CliOptions): UpdateApplyResult {
  const host = currentHost(root)
  if (host) throw new Error(`refusing update apply while dshx supervises Host pid ${host.pid}`)
  const candidate = assertCandidateGate(root, options)
  const transaction = new Date().toISOString().replace(/[:.]/g, '-')
  const backupRoot = join(stateDir(root), 'update-assistant', safeTag(candidate.target.tag), `rollback-${transaction}`)
  const rollbackPath = rollbackStatePath(root, candidate.target.tag)
  const plan = collectUpdatePlan(root, candidate.target.tag)
  const state: UpdateRollbackState = {
    schemaVersion: 1,
    status: 'prepared',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceRoot: resolve(root),
    original: {
      branch: plan.checkout.branch,
      sha: plan.checkout.sha,
      version: plan.checkout.version,
    },
    target: {
      tag: candidate.target.tag,
      sha: candidate.target.sha,
      version: candidate.target.version,
    },
    updateBranch: updateBranchName(candidate.target.tag),
    candidateStatePath: join(stateDir(root), 'update-assistant', safeTag(candidate.target.tag), 'state.json'),
    backupRoot,
    rootNodeModules: backupOf(join(root, 'node_modules'), join(backupRoot, 'root-node_modules')),
    plugins: pluginBackups(candidate, backupRoot),
  }
  persistRollback(rollbackPath, state)
  const pluginBuilds: Record<string, boolean> = {}
  const pluginChecks: Record<string, boolean> = {}
  try {
    moveToBackup(state.rootNodeModules)
    persistRollback(rollbackPath, state)
    switchToTarget(root, state.updateBranch, candidate.target.sha)
    const logs = join(stateDir(root), 'update-assistant', safeTag(candidate.target.tag), 'logs')
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CI: '1',
      LEFTHOOK: '0',
      PATH: `${join(root, 'node_modules/.bin')}:${process.env.PATH ?? ''}`,
    }
    const installed = runCommand(root, 'pnpm', ['install', '--frozen-lockfile'], env)
    const installLog = recordCommand(join(logs, 'apply-harness-install.log'), installed)
    if (!installed.ok) throw new Error(`target Harness install failed; see ${installLog}`)
    const built = runCommand(root, 'pnpm', ['run', 'build'], env)
    const buildLog = recordCommand(join(logs, 'apply-harness-build.log'), built)
    if (!built.ok) throw new Error(`target Harness build failed; see ${buildLog}`)

    for (const backup of state.plugins) {
      moveToBackup(backup.nodeModules)
      moveToBackup(backup.lib)
      createPluginDependencyView(root, backup.nodeModules)
      persistRollback(rollbackPath, state)
    }
    for (const plugin of candidate.plugins) {
      const script = packageBuildScript(plugin.sourcePath)
      if (!script) {
        pluginBuilds[plugin.name] = true
        continue
      }
      const result = runCommand(plugin.sourcePath, '/bin/sh', ['-c', script], env)
      recordCommand(join(logs, `apply-${plugin.name}-build.log`), result)
      pluginBuilds[plugin.name] = result.ok
    }
    for (const plugin of candidate.plugins) {
      const checked: CommandResult = pluginBuilds[plugin.name] === true
        ? cliCheck(root, plugin, env)
        : { ok: false, code: 1, command: 'skipped', stdout: '', stderr: 'build failed', durationMs: 0 }
      recordCommand(join(logs, `apply-${plugin.name}-check.log`), checked)
      pluginChecks[plugin.name] = checked.ok
    }
    const failed = candidate.plugins.filter(plugin => !pluginBuilds[plugin.name] || !pluginChecks[plugin.name])
    if (failed.length > 0) throw new Error(`target plugin gate failed: ${failed.map(plugin => plugin.name).join(', ')}`)
    state.status = 'applied'
    persistRollback(rollbackPath, state)
    return { ok: true, rollbackPath, state, pluginBuilds, pluginChecks }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    state.applyError = message
    try {
      restoreTransaction(state)
      state.status = 'auto-rolled-back'
      persistRollback(rollbackPath, state)
    } catch (rollbackError) {
      state.applyError = `${message}; automatic rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
      persistRollback(rollbackPath, state)
    }
    throw new Error(state.applyError)
  }
}

export function rollbackUpdate(root: string, options: CliOptions): UpdateApplyResult {
  const host = currentHost(root)
  if (host) throw new Error(`refusing rollback while dshx supervises Host pid ${host.pid}`)
  const plan = collectUpdatePlan(root, options.target)
  const path = rollbackStatePath(root, plan.target.tag)
  if (!existsSync(path)) throw new Error(`rollback state missing: ${path}`)
  const state = loadJson<UpdateRollbackState>(path)
  if (state.schemaVersion !== 1 || state.sourceRoot !== resolve(root)) throw new Error(`invalid rollback state: ${path}`)
  if (state.status !== 'applied') throw new Error(`rollback is unavailable from state ${state.status}`)
  restoreTransaction(state)
  state.status = 'rolled-back'
  persistRollback(path, state)
  return { ok: true, rollbackPath: path, state, pluginBuilds: {}, pluginChecks: {} }
}
