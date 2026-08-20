/** Fixed-argument bridge from DSH tools to the external dshx CLI. */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_CAPTURE_BYTES = 64 * 1024
const PLUGIN_ID = /^[a-z][a-z0-9-]*$/
const KINDS = new Set(['function', 'tool', 'client', 'object', 'class'])
const CHANGES = new Set(['patch', 'manifest', 'preset', 'client', 'new-client', 'server', 'artifact'])

function isAllowedArgs(args) {
  if (args.length === 1) return args[0] === 'status'
  if (args.length === 2) return args[0] === 'check' && PLUGIN_ID.test(args[1])
  if (args.length !== 4 || !PLUGIN_ID.test(args[1])) return false
  if (args[0] === 'init') return args[2] === '--kind' && KINDS.has(args[3])
  return args[0] === 'activation-plan' && args[2] === '--change' && CHANGES.has(args[3])
}

function isHarnessRoot(path) {
  return existsSync(join(path, 'apps/cli/src/bin.ts'))
    && existsSync(join(path, 'tools/dshx/src/cli.ts'))
}

function walkForHarness(start) {
  let cursor = resolve(start)
  while (true) {
    if (isHarnessRoot(cursor)) return cursor
    const parent = dirname(cursor)
    if (parent === cursor) return undefined
    cursor = parent
  }
}

/**
 * Resolve the checkout through the same stable inputs as the dshx skill.
 * @param options - Testable environment, config, and starting directories.
 * @returns Absolute DeepSeek Harness checkout path.
 */
export function resolveHarnessRoot(options = {}) {
  const candidates = []
  const addCandidate = (path, source) => {
    const root = resolve(path)
    if (!candidates.some(candidate => candidate.root === root)) candidates.push({ root, source })
  }

  const configured = options.envRoot?.trim() || process.env.DSHX_HARNESS?.trim()
  if (configured) {
    if (!isHarnessRoot(configured)) {
      throw new Error(`dshx/creator-plus: DSHX_HARNESS is not a Harness checkout with tools/dshx: ${resolve(configured)}`)
    }
    addCandidate(configured, 'env')
  }

  const configFile = options.configFile ?? join(homedir(), '.config/dshx/harness')
  if (existsSync(configFile)) {
    const value = readFileSync(configFile, 'utf8').trim()
    if (value) {
      if (!isHarnessRoot(value)) {
        throw new Error(`dshx/creator-plus: ${configFile} is not a Harness checkout with tools/dshx: ${resolve(value)}`)
      }
      addCandidate(value, 'config')
    }
  }

  const fromCwd = walkForHarness(options.cwd ?? process.cwd())
  if (fromCwd) addCandidate(fromCwd, 'cwd')

  const moduleDir = options.moduleDir ?? dirname(fileURLToPath(import.meta.url))
  const fromModule = walkForHarness(moduleDir)
  if (fromModule) addCandidate(fromModule, 'module')

  if (candidates.length === 0) {
    throw new Error('dshx/creator-plus: no Harness checkout found; run dshx setup or set DSHX_HARNESS')
  }
  if (candidates.length > 1) {
    const listed = candidates.map(candidate => `${candidate.source}: ${candidate.root}`).join('; ')
    throw new Error(`dshx/creator-plus: multiple Harness checkouts found (${listed}); refusing to guess`)
  }
  return candidates[0].root
}

function appendBounded(current, chunk) {
  const combined = Buffer.concat([Buffer.from(current, 'utf8'), chunk])
  if (combined.byteLength <= MAX_CAPTURE_BYTES) return combined.toString('utf8')
  return `[earlier output truncated]\n${combined.subarray(-MAX_CAPTURE_BYTES).toString('utf8')}`
}

/**
 * Execute one dshx operation without exposing a shell or arbitrary argv.
 * @param args - Command arguments selected by the registered tool.
 * @param signal - DSH tool cancellation signal.
 * @returns Bounded stdout, stderr, and exit code.
 */
export function runDshx(args, signal) {
  if (!Array.isArray(args) || !args.every(value => typeof value === 'string') || !isAllowedArgs(args)) {
    throw new Error('dshx/creator-plus: refusing an operation outside the fixed command allowlist')
  }
  const root = resolveHarnessRoot()
  const cli = join(root, 'tools/dshx/src/cli.ts')
  const argv = ['--import', 'tsx/esm', cli, ...args]
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, argv, {
      cwd: root,
      env: { ...process.env, DSHX_HARNESS: root },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout = appendBounded(stdout, chunk) })
    child.stderr.on('data', chunk => { stderr = appendBounded(stderr, chunk) })

    const abort = () => { child.kill('SIGTERM') }
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    child.once('error', reject)
    child.once('close', (code) => {
      signal?.removeEventListener('abort', abort)
      resolveResult({
        command: `dshx ${args.join(' ')}`,
        exitCode: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      })
    })
  })
}
