#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dshxRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const loader = realpathSync(join(dshxRoot, 'node_modules/tsx/dist/esm/index.mjs'))
const cli = join(dshxRoot, 'src/cli.ts')
const expectVulnerable = process.argv.includes('--expect-vulnerable')

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

async function freePort() {
  const server = createServer()
  await new Promise((accept, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', accept)
  })
  const address = server.address()
  assert.equal(typeof address, 'object')
  const port = address.port
  await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()))
  return port
}

function fakeHarness(root) {
  write(join(root, 'package.json'), '{"name":"fake-harness","version":"0.1.2-rc.1"}\n')
  write(join(root, 'apps/cli/src/bin.ts'), `
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
const args = process.argv.slice(2)
if (args[0] !== 'web') process.exit(2)
const at = args.indexOf('--port')
const port = Number(args[at + 1])
const home = process.env.DSH_HOME
if (!home || !Number.isInteger(port)) process.exit(2)
const profile = join(home, 'profiles/web')
mkdirSync(profile, { recursive: true })
const fd = openSync(join(profile, 'package.json'), 'a+')
const server = createServer((_request, response) => response.end('ok'))
let closing = false
function close() {
  if (closing) return
  closing = true
  server.close(() => { closeSync(fd); process.exit(0) })
}
process.once('SIGTERM', close)
process.once('SIGINT', close)
server.listen(port, '127.0.0.1')
setInterval(() => {}, 1000)
`)
  mkdirSync(join(root, 'tools'), { recursive: true })
  symlinkSync(dshxRoot, join(root, 'tools/dshx'), 'dir')
  symlinkSync(join(dshxRoot, 'node_modules'), join(root, 'node_modules'), 'dir')
}

function runDshx(root, home, args) {
  const child = spawn(process.execPath, ['--import', loader, cli, ...args, '--harness', root, '--json'], {
    cwd: root,
    env: { ...process.env, DSH_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  return new Promise(resolve => child.once('close', code => resolve({ code, stdout, stderr })))
}

function startDirectHost(root, home, port) {
  return spawn(process.execPath, [
    '--import', loader, join(root, 'apps/cli/src/bin.ts'), 'web', '--no-open', '--port', String(port),
  ], {
    cwd: root,
    env: { ...process.env, DSH_HOME: home },
    stdio: 'ignore',
  })
}

function readJson(path) {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

function processCommand(pid) {
  return spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).stdout.trim()
}

function live(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code !== 'ESRCH'
  }
}

async function stopOwnedProcess(pid, expected) {
  if (!live(pid)) return
  const command = processCommand(pid)
  assert.match(command, expected, `refusing to stop an unproved process: ${pid} ${command}`)
  process.kill(pid, 'SIGTERM')
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline && live(pid)) await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(live(pid), false, `test-owned process ${pid} did not stop`)
}

async function cleanup(base, roots) {
  const hostStates = roots.map(root => readJson(join(root, '.dshx/host.json'))).filter(Boolean)
  const guardianStates = roots.map(root => readJson(join(root, '.dshx/creator-plus/guardian-state.json'))).filter(Boolean)
  for (const state of hostStates) {
    await stopOwnedProcess(state.pid, new RegExp(`${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/harness-[ab]/apps/cli/src/bin\\.ts`))
  }
  for (const state of guardianStates) {
    await stopOwnedProcess(state.pid, /guardian-daemon\.ts/)
  }
  const lingering = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).stdout
    .split(/\r?\n/)
    .filter(line => line.includes(base))
  assert.deepEqual(lingering, [], `temporary processes remain:\n${lingering.join('\n')}`)
  rmSync(base, { recursive: true, force: true })
}

async function untrackedHostBlocksApply() {
  const base = mkdtempSync(join(tmpdir(), 'dshx-update-host-'))
  const home = join(base, 'shared-home')
  const root = join(base, 'harness-a')
  fakeHarness(root)
  const port = await freePort()
  const host = startDirectHost(root, home, port)
  assert.ok(host.pid)
  try {
    await new Promise(resolve => setTimeout(resolve, 300))
    assert.equal(live(host.pid), true)
    assert.equal(existsSync(join(root, '.dshx/host.json')), false, 'fixture must remain untracked by dshx state')
    const applied = await runDshx(root, home, ['update', 'apply'])
    assert.equal(applied.code, 1, JSON.stringify(applied, null, 2))
    assert.match(applied.stdout + applied.stderr, /refusing update apply: affected or unproved live Web Host/)
    assert.equal(existsSync(join(root, '.dshx/update-assistant')), false, 'blocked apply must not create rollback or mutate the install')
    process.stdout.write(`UNTRACKED_HOST_BLOCKS_APPLY_PASS pid=${host.pid} port=${port}\n`)
  } finally {
    await stopOwnedProcess(host.pid, new RegExp(`${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/harness-a/apps/cli/src/bin\\.ts`))
    await cleanup(base, [root])
  }
}

async function runRaceAttempt(index) {
  const base = mkdtempSync(join(tmpdir(), `dshx-single-host-${index}-`))
  const home = join(base, 'shared-home')
  const roots = [join(base, 'harness-a'), join(base, 'harness-b')]
  roots.forEach(fakeHarness)
  const ports = [await freePort(), await freePort()]
  try {
    const results = await Promise.all(roots.map((root, offset) => runDshx(root, home, ['start', 'web', '--port', String(ports[offset])])))
    await new Promise(resolve => setTimeout(resolve, 800))
    const states = roots.map(root => readJson(join(root, '.dshx/host.json'))).filter(Boolean)
    const livePids = [...new Set(states.map(state => state.pid).filter(live))]
    return { base, roots, ports, results, livePids }
  } catch (error) {
    await cleanup(base, roots)
    throw error
  }
}

let observed
for (let attempt = 1; attempt <= 12; attempt += 1) {
  const result = await runRaceAttempt(attempt)
  if (result.livePids.length > 1 || !expectVulnerable) {
    observed = result
    break
  }
  await cleanup(result.base, result.roots)
}
assert.ok(observed, 'the pre-fix race did not reproduce in 12 attempts')
try {
  if (expectVulnerable) {
    assert.ok(observed.livePids.length > 1, `expected duplicate real child Hosts, found ${observed.livePids.length}`)
    process.stdout.write(`RACE_REPRODUCED hosts=${observed.livePids.join(',')} ports=${observed.ports.join(',')}\n`)
  } else {
    assert.equal(observed.livePids.length, 1, `expected one shared-Home Host, found ${observed.livePids.length}`)
    assert.equal(observed.results.filter(result => result.code === 0).length, 2, JSON.stringify(observed.results, null, 2))
    process.stdout.write(`SINGLE_HOST_RACE_PASS pid=${observed.livePids[0]}\n`)
  }
} finally {
  await cleanup(observed.base, observed.roots)
}
if (!expectVulnerable) await untrackedHostBlocksApply()
process.stdout.write('TEMP_PROCESS_CLEANUP_PASS\n')
