import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, it } from 'node:test'
import { installCreatorPlus } from '../scripts/install-creator-plus.mjs'
import { apply, installClientFailureRoute } from '../src/creator-plus/index.js'
import {
  CREATOR_BRIDGE_VERSION,
  currentWebPort,
  deliverCreatorRecovery,
  releaseCreatorClaim,
  resolveHarnessRoot,
  runClientFailureDshx,
  runDshx,
} from '../src/creator-plus/runner.js'

const temporaryRoots: string[] = []

function temporaryDirectory(label: string): string {
  const path = mkdtempSync(join(tmpdir(), label))
  temporaryRoots.push(path)
  return path
}

function harnessAt(root: string): string {
  mkdirSync(join(root, 'apps/cli/src'), { recursive: true })
  mkdirSync(join(root, 'apps/cli/config/agent-presets/standard'), { recursive: true })
  mkdirSync(join(root, 'tools/dshx/src'), { recursive: true })
  writeFileSync(join(root, 'apps/cli/src/bin.ts'), '')
  writeFileSync(join(root, 'tools/dshx/src/cli.ts'), '')
  writeFileSync(join(root, 'apps/cli/config/agent-presets/standard/preset.yml'), 'name: Standard\n')
  writeFileSync(join(root, 'apps/cli/config/agent-presets/standard/agent.cordis.yml'), `# The \`standard\` agent preset: the full coding agent, mounted once per process.
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: >-
      You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.
- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
- id: tool-skill
  name: '@deepseek-ai/dsh-tool-skill'
`)
  return root
}

afterEach(() => {
  for (const path of temporaryRoots.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('Creator Mode+ bridge', () => {
  it('registers only fixed non-process-control tools, including claims and bounded new-client activation', () => {
    const tools: Array<Record<string, unknown>> = []
    apply({
      tools: { register(tool: Record<string, unknown>) { tools.push(tool) } },
      webServer: { port: 43127, register() { return () => {} } },
      effect(callback: () => unknown, label: string) {
        if (label.includes('browser failure route')) callback()
      },
    })

    assert.deepEqual(tools.map(tool => tool.name), [
      'dshx_claim_plugin',
      'dshx_scaffold',
      'dshx_check',
      'dshx_activation_plan',
      'dshx_activate_new_client',
      'dshx_status',
    ])
    assert.equal(tools.some(tool => /start|stop|restart|shell|command/.test(String(tool.name))), false)
    assert.throws(
      () => (tools[0]!.execute as (args: object, exec: object) => unknown)({ name: '../escape' }, { signal: undefined }),
      /lower-case kebab-case/,
    )
    assert.throws(() => runDshx(['restart']), /outside bridge v2/)
    assert.throws(
      () => runDshx(['activate-new-client', 'demo', '--profile', 'web', '--port', 'not-a-port']),
      /outside bridge v2/,
    )
  })

  it('forwards browser failure data with fixed argv and Host-owned identity', async () => {
    const root = harnessAt(temporaryDirectory('dshx-creator-client-failure-'))
    let spawnedArgs: string[] = []
    let spawnedOptions: Record<string, unknown> = {}
    const spawnProcess = (_command: string, args: string[], options: Record<string, unknown>) => {
      spawnedArgs = args
      spawnedOptions = options
      const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill(): boolean }
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      child.kill = () => true
      queueMicrotask(() => child.emit('close', 0))
      return child
    }
    await runClientFailureDshx({
      failedIds: ['demo'],
      message: 'Failed to load plugins',
      hostPid: 11,
      hostParentPid: 10,
      hostPort: 43127,
    }, { envRoot: root, configFile: '/missing', cwd: '/missing', moduleDir: '/missing', spawnProcess })
    assert.deepEqual(spawnedArgs.slice(-3), ['creator', 'client-failure', '--json'])
    assert.equal('DSHX_CREATOR_CONTEXT' in (spawnedOptions.env as object), false)
    assert.deepEqual(JSON.parse((spawnedOptions.env as Record<string, string>).DSHX_CREATOR_CLIENT_FAILURE!), {
      failedIds: ['demo'],
      message: 'Failed to load plugins',
      hostPid: 11,
      hostParentPid: 10,
      hostPort: 43127,
    })
  })

  it('accepts only same-origin bounded reports and stamps the live Host identity', async () => {
    let route: Record<string, unknown> | undefined
    let forwarded: Record<string, unknown> | undefined
    installClientFailureRoute({
      webServer: {
        port: 43127,
        register(value: Record<string, unknown>) { route = value; return () => {} },
      },
      effect(callback: () => unknown) { callback() },
    }, {
      runClientFailureDshx: async (report: Record<string, unknown>) => {
        forwarded = report
        return { exitCode: 0, stdout: JSON.stringify({ data: { reload: true, incident: { id: 'incident-a' } } }), stderr: '' }
      },
    })
    const req = new PassThrough() as PassThrough & { method: string; headers: Record<string, string> }
    req.method = 'POST'
    req.headers = { origin: 'http://127.0.0.1:43127', host: '127.0.0.1:43127' }
    const response: { status?: number; body?: string; writeHead(status: number): void; end(body?: string): void } = {
      writeHead(status) { this.status = status },
      end(body = '') { this.body = body },
    }
    req.end(JSON.stringify({ failedIds: ['demo'], message: 'failed', hostPid: 1 }))
    await (route!.handler as (req: unknown, res: unknown) => Promise<void>)(req, response)
    assert.equal(response.status, 200)
    assert.equal(JSON.parse(response.body!).reload, true)
    assert.deepEqual(forwarded, {
      failedIds: ['demo'],
      message: 'failed',
      hostPid: process.pid,
      hostParentPid: process.ppid,
      hostPort: 43127,
    })
  })

  it('shares one client-failure route across live preset generations', async () => {
    const first = await import(`../src/creator-plus/index.js?generation=first-${Date.now()}`)
    const second = await import(`../src/creator-plus/index.js?generation=second-${Date.now()}`)
    const releases: Array<() => void> = []
    let registrations = 0
    let disposals = 0
    let route: Record<string, unknown> | undefined
    let owner: string | undefined
    const webServer = {
      port: 43127,
      register(value: Record<string, unknown>) {
        if (route !== undefined) throw new Error('duplicate exact route')
        registrations += 1
        route = value
        return () => {
          route = undefined
          disposals += 1
        }
      },
    }
    const context = {
      webServer,
      effect(callback: () => () => void) { releases.push(callback()) },
    }

    first.installClientFailureRoute(context, {
      runClientFailureDshx: async () => {
        owner = 'first'
        return { exitCode: 0, stdout: '{}', stderr: '' }
      },
    })
    second.installClientFailureRoute(context, {
      runClientFailureDshx: async () => {
        owner = 'second'
        return { exitCode: 0, stdout: '{}', stderr: '' }
      },
    })

    assert.equal(registrations, 1)
    const req = new PassThrough() as PassThrough & { method: string; headers: Record<string, string> }
    req.method = 'POST'
    req.headers = { origin: 'http://127.0.0.1:43127', host: '127.0.0.1:43127' }
    const response: { status?: number; body?: string; writeHead(status: number): void; end(body?: string): void } = {
      writeHead(status) { this.status = status },
      end(body = '') { this.body = body },
    }
    req.end(JSON.stringify({ failedIds: ['demo'], message: 'failed' }))
    await (route!.handler as (request: unknown, reply: unknown) => Promise<void>)(req, response)
    assert.equal(owner, 'second')

    releases[1]!()
    assert.equal(disposals, 0)
    owner = undefined
    const fallbackRequest = new PassThrough() as PassThrough & { method: string; headers: Record<string, string> }
    fallbackRequest.method = 'POST'
    fallbackRequest.headers = { origin: 'http://127.0.0.1:43127', host: '127.0.0.1:43127' }
    fallbackRequest.end(JSON.stringify({ failedIds: ['demo'], message: 'failed again' }))
    await (route!.handler as (request: unknown, reply: unknown) => Promise<void>)(fallbackRequest, response)
    assert.equal(owner, 'first')

    releases[0]!()
    assert.equal(disposals, 1)
  })

  it('stamps session provenance and steers only the matching recovery session', async () => {
    const root = harnessAt(temporaryDirectory('dshx-creator-context-'))
    let spawned: Record<string, unknown> | undefined
    const spawnProcess = (_command: string, _args: string[], options: Record<string, unknown>) => {
      spawned = options
      const child = new EventEmitter() as EventEmitter & {
        stdout: PassThrough
        stderr: PassThrough
        kill(): boolean
      }
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      child.kill = () => true
      queueMicrotask(() => child.emit('close', 0))
      return child
    }
    await runDshx(['status'], {
      agent: { id: 'session-a' },
      callId: 'call-a',
      rootCallId: 'root-a',
      signal: new AbortController().signal,
    }, {
      envRoot: root,
      configFile: '/missing',
      cwd: '/missing',
      moduleDir: '/missing',
      hostPort: 43127,
      spawnProcess,
    })
    const env = (spawned?.env ?? {}) as Record<string, string>
    assert.equal(CREATOR_BRIDGE_VERSION, 2)
    assert.deepEqual(JSON.parse(env.DSHX_CREATOR_CONTEXT!), {
      sessionId: 'session-a',
      callId: 'call-a',
      rootCallId: 'root-a',
      hostPid: process.pid,
      hostParentPid: process.ppid,
      hostPort: 43127,
      bridgeVersion: 2,
    })

    const incidentId = '11111111-1111-4111-8111-111111111111'
    const messages: Array<Record<string, unknown>> = []
    const calls: string[][] = []
    await deliverCreatorRecovery({
      id: 'session-a',
      steer(message: Record<string, unknown>) { messages.push(message) },
    }, {
      hostPort: 43127,
      runDshx: async (args: string[]) => {
        calls.push(args)
        return args[2] === 'pull'
          ? { exitCode: 0, stdout: JSON.stringify({ data: { incidents: [{ id: incidentId, summary: 'recovered', pluginId: 'demo', rollback: 'disabled' }] } }), stderr: '' }
          : { exitCode: 0, stdout: '{}', stderr: '' }
      },
    })
    assert.deepEqual((messages[0]!.source as Record<string, unknown>), { kind: 'plugin', plugin: 'dshx-creator-plus' })
    assert.deepEqual(calls[0], ['creator', 'watch', '--json'])
    assert.deepEqual(calls[2], ['creator', 'recovery', 'ack', incidentId, '--json'])

    await releaseCreatorClaim({ id: 'session-a' }, {
      hostPort: 43127,
      runDshx: async (args: string[]) => {
        calls.push(args)
        return { exitCode: 0, stdout: '{}', stderr: '' }
      },
    })
    assert.deepEqual(calls[3], ['creator', 'release', '--json'])
  })

  it('derives only the current official WebUI port for the activation bridge', () => {
    assert.equal(currentWebPort(['node', 'bin.ts', 'web', '--port', '43127', '--no-open']), 43127)
    assert.equal(currentWebPort(['node', 'bin.ts', '--profile', 'web']), 3080)
    assert.throws(() => currentWebPort(['node', 'bin.ts', 'headless']), /Web profile/)
    assert.throws(() => currentWebPort(['node', 'bin.ts', 'web', '--port', '0']), /valid TCP port/)
  })

  it('resolves an explicit checkout and walks upward', () => {
    const root = harnessAt(temporaryDirectory('dshx-creator-root-'))
    const nested = join(root, 'workspace/example/src')
    mkdirSync(nested, { recursive: true })
    assert.equal(resolveHarnessRoot({ envRoot: root, configFile: '/missing', cwd: '/missing', moduleDir: '/missing' }), root)
    assert.equal(resolveHarnessRoot({ configFile: '/missing', cwd: nested, moduleDir: '/missing' }), root)
  })

  it('fails closed on invalid or conflicting checkout authority', () => {
    const first = harnessAt(temporaryDirectory('dshx-creator-first-'))
    const second = harnessAt(temporaryDirectory('dshx-creator-second-'))
    assert.throws(
      () => resolveHarnessRoot({ envRoot: '/missing', configFile: '/missing', cwd: first, moduleDir: '/missing' }),
      /DSHX_HARNESS is not a Harness checkout/,
    )
    assert.throws(
      () => resolveHarnessRoot({ envRoot: first, configFile: '/missing', cwd: second, moduleDir: '/missing' }),
      /multiple Harness checkouts found/,
    )
  })

  it('copies Standard into a user preset without changing shipped files', () => {
    const harnessRoot = harnessAt(temporaryDirectory('dshx-creator-harness-'))
    const dshHome = temporaryDirectory('dshx-creator-home-')
    const source = join(harnessRoot, 'apps/cli/config/agent-presets/standard/agent.cordis.yml')
    const before = readFileSync(source, 'utf8')

    const target = installCreatorPlus({ harnessRoot, dshHome })
    const composition = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')

    assert.equal(readFileSync(source, 'utf8'), before)
    assert.match(composition, /You are Creator Mode\+/)
    assert.match(composition, /name: dsh-external-plugin-devkit\n/)
    assert.equal(existsSync(join(target, 'skills/creator-mode-plus/SKILL.md')), true)
    assert.match(readFileSync(join(target, 'preset.yml'), 'utf8'), /Creator Mode\+/)
    assert.throws(() => installCreatorPlus({ harnessRoot, dshHome }), /refusing to overwrite/)
  })

  it('upgrades only Creator Mode+ managed assets and preserves the user composition', () => {
    const harnessRoot = harnessAt(temporaryDirectory('dshx-creator-upgrade-harness-'))
    const dshHome = temporaryDirectory('dshx-creator-upgrade-home-')
    const target = installCreatorPlus({ harnessRoot, dshHome })
    const compositionPath = join(target, 'agent.cordis.yml')
    const skillPath = join(target, 'skills/creator-mode-plus/SKILL.md')
    writeFileSync(
      compositionPath,
      `${readFileSync(compositionPath, 'utf8').replace(
        'name: dsh-external-plugin-devkit\n',
        'name: dsh-external-plugin-devkit/creator-plus\n',
      )}\n# user-preserved\n`,
    )
    writeFileSync(skillPath, '# stale managed skill\n')

    assert.equal(installCreatorPlus({ harnessRoot, dshHome, upgrade: true }), target)
    assert.match(readFileSync(compositionPath, 'utf8'), /# user-preserved/)
    assert.match(readFileSync(compositionPath, 'utf8'), /name: dsh-external-plugin-devkit\n/)
    assert.doesNotMatch(readFileSync(compositionPath, 'utf8'), /dsh-external-plugin-devkit\/creator-plus/)
    assert.match(readFileSync(skillPath, 'utf8'), /dshx_activate_new_client/)
    assert.match(readFileSync(join(target, 'preset.yml'), 'utf8'), /会话认领.*外部 Guardian/)
  })

  it('keeps the composition stamp stable when an upgrade changes only managed assets', () => {
    const harnessRoot = harnessAt(temporaryDirectory('dshx-creator-idempotent-harness-'))
    const dshHome = temporaryDirectory('dshx-creator-idempotent-home-')
    const target = installCreatorPlus({ harnessRoot, dshHome })
    const compositionPath = join(target, 'agent.cordis.yml')
    const before = statSync(compositionPath)

    installCreatorPlus({ harnessRoot, dshHome, upgrade: true })

    const after = statSync(compositionPath)
    assert.equal(after.size, before.size)
    assert.equal(after.mtimeMs, before.mtimeMs)
  })

  it('refuses an ambiguous bundled Creator+ managed row during upgrade', () => {
    const harnessRoot = harnessAt(temporaryDirectory('dshx-creator-ambiguous-harness-'))
    const dshHome = temporaryDirectory('dshx-creator-ambiguous-home-')
    const target = installCreatorPlus({ harnessRoot, dshHome })
    const compositionPath = join(target, 'agent.cordis.yml')
    const composition = readFileSync(compositionPath, 'utf8')
    const row = '- id: dshx-creator-plus\n  name: dsh-external-plugin-devkit'
    writeFileSync(compositionPath, `${composition.trimEnd()}\n\n${row}\n`)

    assert.throws(
      () => installCreatorPlus({ harnessRoot, dshHome, upgrade: true }),
      /exactly one recognized managed dshx row/,
    )
  })
})
