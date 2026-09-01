import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dshEnv, dumpConfig, parseDumpEntries } from '../internal/dsh.ts'
import { discoverWebHosts } from '../internal/host-discovery.ts'
import { currentHost, followLog, logContains, probePid, probePort, readLastHost, readLogTail, startHost, startTransientHost, stopHost, stopTransientHost, waitForHttp, waitForLog, writeHostState } from '../internal/host.ts'
import { armGuardian, disarmGuardian, ensureGuardian, guardianCreatorSnapshot } from '../internal/guardian.ts'
import { finding, printReport, report } from '../internal/io.ts'
import { writeOverlay } from '../internal/overlay.ts'
import { hostLogPath, resolveDshHome } from '../internal/paths.ts'
import { loadPlugin } from '../internal/plugin.ts'
import { ensureRuntimePackageLink } from '../internal/runtime-package.ts'
import type { CliOptions, PluginManifest, ProfileName } from '../internal/types.ts'

function resolveProfile(args: string[], options: CliOptions): { profile: ProfileName; pluginArg?: string; rest: string[] } {
  if (args[0] === 'web' || args[0] === 'headless') {
    return { profile: args[0], pluginArg: args[1], rest: args.slice(2) }
  }
  return { profile: options.profile, pluginArg: args[0], rest: args.slice(1) }
}

function preparePlugin(root: string, name: string | undefined, profile: ProfileName): { plugin?: PluginManifest; overlay?: string } {
  if (!name) return {}
  const plugin = loadPlugin(root, name)
  ensureRuntimePackageLink(plugin, resolveDshHome(dshEnv(root)), profile)
  return { plugin, overlay: writeOverlay(root, plugin) }
}

function hostList(hosts: readonly { pid: number; port: number }[]): string {
  return hosts.map(host => `pid ${host.pid} on 127.0.0.1:${host.port}`).join(', ')
}

export async function cmdStart(args: string[], options: CliOptions, root: string): Promise<number> {
  const { profile, pluginArg, rest } = resolveProfile(args, options)
  try {
    const supervised = currentHost(root)
    const home = resolveDshHome(dshEnv(root))
    const discovery = profile === 'web' ? discoverWebHosts(root, home) : undefined
    const sameHome = discovery?.hosts.filter(host => host.home === 'same') ?? []
    const uncertain = discovery?.hosts.filter(host => host.home === 'unknown') ?? []
    if (discovery?.complete && (sameHome.length > 1 || (supervised && sameHome.some(host => host.pid !== supervised.pid)))) {
      printReport(report('start', [finding('error', 'shared-home-collision', `multiple Web Hosts use the same DSH_HOME: ${hostList(sameHome)}`, {
        hint: 'do not start or restart another Host. Keep one user Host; cold-boot proof belongs in verify-boot\'s temporary DSH_HOME',
      })], { home, discovery }), options.json)
      return 1
    }
    if (discovery?.complete && uncertain.length > 0) {
      printReport(report('start', [finding('error', 'host-home-unknown', `found Web Host process(es) whose DSH_HOME cannot be proved: ${hostList(uncertain)}`, {
        hint: 'DSHX fails closed instead of assuming another port is isolated. Use status from an external terminal or verify-boot for an isolated proof',
      })], { home, discovery }), options.json)
      return 1
    }
    if (profile === 'web' && sameHome.length === 1
      && (!supervised || (supervised.ownership === 'adopted' && supervised.pid === sameHome[0]!.pid))) {
      const observed = sameHome[0]!
      const alreadyAttached = supervised?.ownership === 'adopted' && supervised.pid === observed.pid
      const attached = alreadyAttached ? supervised : {
        pid: observed.pid,
        profile: 'web' as const,
        port: observed.port,
        overlay: '',
        logFile: hostLogPath(root, 'web'),
        startedAt: new Date().toISOString(),
        command: [],
        ownership: 'adopted' as const,
      }
      if (!alreadyAttached) writeHostState(root, attached)
      const findings = [
        finding('ok', alreadyAttached ? 'already-attached' : 'attached', `${alreadyAttached ? 'already attached' : 'attached'} to existing Web Host pid ${attached.pid} on 127.0.0.1:${attached.port}; no process was started`),
        finding('info', 'external-lifecycle', 'the existing App/CLI launcher owns this Host; dshx stop/restart-supervised will refuse it'),
      ]
      if (pluginArg) findings.push(finding('error', 'activation-unproven', `${pluginArg} was not mounted by attaching to an existing Host`, {
        hint: `run activation-plan ${pluginArg} --change <surface>, then execute that same-PID branch`,
      }))
      printReport(report('start', findings, { host: attached, discovery }), options.json)
      return pluginArg ? 1 : 0
    }
    if (supervised) {
      printReport(report('start', [finding('error', 'already-supervising', `dshx already supervises pid ${supervised.pid} on port ${supervised.port}`, {
        hint: 'leave it running while you classify the change with activation-plan; if that branch truly requires restart, use restart-supervised. --force never takes it over',
      })]), options.json)
      return 1
    }
    if (discovery && !discovery.complete) {
      printReport(report('start', [finding('error', 'host-discovery-unknown', discovery.reason ?? 'cannot inspect running Web Hosts', {
        hint: 'refusing to spawn against an unproved DSH_HOME. Run from an external terminal with process visibility, or use verify-boot for an isolated proof',
      })], { home, discovery }), options.json)
      return 1
    }
    if (profile === 'headless') {
      const { plugin, overlay } = preparePlugin(root, pluginArg, profile)
      disarmGuardian(root)
      const task = options.task ?? rest.join(' ')
      if (!task.trim()) {
        printReport(report('start', [finding('error', 'usage', 'headless needs a task: dshx start headless <plugin> --task "..."')]), options.json)
        return 1
      }
      const state = startHost(root, {
        profile,
        port: options.port,
        overlay,
        plugin: plugin?.id,
        extraArgs: [task],
      })
      printReport(report('start', [finding('ok', 'spawned', `headless pid ${state.pid}`)], { logFile: state.logFile }), options.json)
      return 0
    }
    const requestedPort = await probePort(options.port)
    if (requestedPort !== 'closed') {
      printReport(report('start', [finding('error', 'port', `port ${options.port} already in use`, {
        hint: requestedPort === 'unknown'
          ? 'port visibility is denied or timed out; DSHX treats it as unknown and refuses to spawn. --force cannot override the shared-home gate'
          : 'the listener is not an isolation boundary. Attach to the existing Host or use verify-boot; --force cannot take it over',
      })]), options.json)
      return 1
    }
    const { plugin, overlay } = preparePlugin(root, pluginArg, profile)
    const state = startHost(root, { profile, port: options.port, overlay, plugin: plugin?.id })
    armGuardian(root, state)
    try {
      await ensureGuardian(root)
    } catch (error) {
      disarmGuardian(root)
      await stopHost(root)
      throw new Error(`Web Host was stopped because its external Guardian did not start: ${error instanceof Error ? error.message : String(error)}`)
    }
    printReport(report('start', [
      finding('ok', 'spawned', `supervising pid ${state.pid} on 127.0.0.1:${state.port}`),
      finding('ok', 'guardian', 'external dshx Guardian is running'),
      finding('info', 'next', 'dshx logs --follow; use activation-plan before deciding reload/restart'),
    ], { logFile: state.logFile, overlay: state.overlay, url: `http://127.0.0.1:${state.port}/` }), options.json)
    return 0
  } catch (error) {
    printReport(report('start', [finding('error', 'start', error instanceof Error ? error.message : String(error))]), options.json)
    return 1
  }
}

export async function cmdStop(_args: string[], options: CliOptions, root: string): Promise<number> {
  const live = currentHost(root)
  if (live?.ownership === 'adopted') {
    printReport(report('stop', [finding('error', 'adopted-host', `refusing to stop adopted Host pid ${live.pid}`, {
      hint: 'this process belongs to the official launcher or App shell. stop that launcher itself; dshx Guardian may recover it only after a detected failure',
    })]), options.json)
    return 1
  }
  disarmGuardian(root, Date.now(), 15_000)
  const state = await stopHost(root)
  if (!state) {
    printReport(report('stop', [finding('info', 'idle', 'no supervised host')]), options.json)
    return 0
  }
  if (!live) {
    printReport(report('stop', [finding('info', 'already-exited', `pid ${state.pid} already gone; cleared supervisor state`)]), options.json)
    return 0
  }
  printReport(report('stop', [finding('ok', 'stopped', `signaled pid ${state.pid}`)]), options.json)
  return 0
}

export async function cmdRestart(args: string[], options: CliOptions, root: string): Promise<number> {
  const live = currentHost(root)
  if (!live) {
    printReport(report('restart-supervised', [finding('error', 'not-supervising', 'no live dshx-supervised host to restart', {
      hint: 'use dshx start with an explicit profile/plugin. restart never resurrects stale last-host.json state',
    })]), options.json)
    return 1
  }
  if (live.ownership === 'adopted') {
    printReport(report('restart-supervised', [finding('error', 'adopted-host', `refusing to restart adopted Host pid ${live.pid}`, {
      hint: 'this process belongs to the official launcher or App shell. restart that launcher externally; Guardian recovery is reserved for detected failure',
    })]), options.json)
    return 1
  }
  if (args.length > 0) {
    printReport(report('restart-supervised', [finding('error', 'target-change', 'restart-supervised restarts the current owned host only', {
      hint: 'to change profile/plugin, run dshx stop and then an explicit dshx start',
    })]), options.json)
    return 1
  }
  if (live.profile === 'headless') {
    printReport(report('restart-supervised', [finding('error', 'headless-task', `refusing to restart headless pid ${live.pid}: its one-shot task is not reconstructible`, {
      hint: 'run dshx stop, then start headless again with an explicit --task',
    })]), options.json)
    return 1
  }
  const home = resolveDshHome(dshEnv(root))
  const discovery = discoverWebHosts(root, home)
  const conflicts = discovery.hosts.filter(host => host.home === 'unknown' || (host.home === 'same' && host.pid !== live.pid))
  if (!discovery.complete || conflicts.length > 0) {
    printReport(report('restart-supervised', [finding('error', 'shared-home-unproven', !discovery.complete
      ? discovery.reason ?? 'cannot inspect running Web Hosts'
      : `another Web Host may share this DSH_HOME: ${hostList(conflicts)}`, {
      hint: 'restart is refused before stopping the owned Host; leave the current PID untouched and resolve the duplicate/unknown Host first',
    })], { home, discovery }), options.json)
    return 1
  }
  disarmGuardian(root, Date.now(), 15_000)
  const stopped = await stopHost(root)
  printReport(report('restart-supervised', [
    finding('ok', 'stopped', `signaled owned pid ${stopped?.pid ?? live.pid}; starting the same target again`),
  ]), options.json)
  const nextOptions = { ...options, profile: live.profile, port: live.port }
  const nextArgs = live.plugin ? [live.profile, live.plugin] : [live.profile]
  return cmdStart(nextArgs, nextOptions, root)
}

export async function cmdStatus(_args: string[], options: CliOptions, root: string): Promise<number> {
  const state = currentHost(root)
  const httpPort = state && state.port > 0 ? state.port : options.port
  const listening = await probePort(httpPort)
  const findings = [
    state
      ? finding('ok', 'supervised', state.profile === 'headless' || state.port <= 0
        ? `pid ${state.pid} profile headless (no HTTP port)`
        : `pid ${state.pid} profile ${state.profile} port ${state.port}`)
      : finding('info', 'supervised', 'dshx is not supervising a host'),
  ]
  if (state) {
    if (state.profile === 'headless' || state.port <= 0) {
      findings.push(finding('info', 'listen', 'headless host has no workshop HTTP port'))
    } else if (listening === 'open') {
      findings.push(finding('ok', 'listen', `supervised host accepts HTTP on 127.0.0.1:${state.port}`))
    } else if (listening === 'unknown') {
      findings.push(finding('warn', 'listen-unknown', `cannot prove whether supervised pid ${state.pid} accepts HTTP on 127.0.0.1:${state.port}`))
    } else {
      findings.push(finding('warn', 'listen', `supervised pid is up but 127.0.0.1:${state.port} is not accepting HTTP yet`))
    }
    if (probePid(state.pid) === 'unknown') findings.push(finding('warn', 'pid-unknown', `pid ${state.pid} exists in supervisor state but process visibility is denied; it is not treated as dead`))
  } else if (listening === 'open') {
    findings.push(finding('warn', 'unsupervised', `127.0.0.1:${httpPort} accepts HTTP but dshx is not supervising it — do not treat this as your plugin host`))
  } else if (listening === 'unknown') {
    findings.push(finding('warn', 'listen-unknown', `cannot prove whether 127.0.0.1:${httpPort} is open; it is not reported closed`))
  } else {
    findings.push(finding('info', 'listen', `127.0.0.1:${httpPort} is closed`))
  }
  const last = !state ? readLastHost(root) : undefined
  if (last) {
    if (last.profile === 'headless' || !last.port) {
      findings.push(finding('info', 'last-port', `last workshop host was headless${last.plugin ? ` (${last.plugin})` : ''} and has no HTTP port — do not treat :${httpPort} as that process`))
    } else {
      const lastOpen = last.port === httpPort ? listening : await probePort(last.port)
      findings.push(lastOpen === 'open'
        ? finding('warn', 'last-port', `last workshop host was 127.0.0.1:${last.port}${last.plugin ? ` (${last.plugin})` : ''} and that port still accepts HTTP`)
        : lastOpen === 'unknown'
          ? finding('warn', 'last-port-unknown', `cannot prove whether last workshop port 127.0.0.1:${last.port} is open; it is not reported closed`)
          : finding('info', 'last-port', `last workshop host was 127.0.0.1:${last.port}${last.plugin ? ` (${last.plugin})` : ''} and is now closed`))
    }
  }
  const home = resolveDshHome(dshEnv(root))
  const discovery = discoverWebHosts(root, home)
  const sameHome = discovery.hosts.filter(host => host.home === 'same')
  const uncertain = discovery.hosts.filter(host => host.home === 'unknown')
  if (!discovery.complete) findings.push(finding('warn', 'host-discovery-unknown', discovery.reason ?? 'cannot inspect Web Host processes'))
  if (sameHome.length > 1) findings.push(finding('error', 'shared-home-collision', `multiple Web Hosts use the same DSH_HOME: ${hostList(sameHome)}`))
  else if (sameHome.length === 1 && state?.pid !== sameHome[0]!.pid) findings.push(finding('warn', 'external-host', `existing App/CLI Web Host uses this DSH_HOME: ${hostList(sameHome)}`))
  if (uncertain.length > 0) findings.push(finding('warn', 'host-home-unknown', `Web Host home could not be proved: ${hostList(uncertain)}`))
  const creator = guardianCreatorSnapshot(root)
  findings.push(creator.guardian.running
    ? finding('ok', 'guardian', `external Guardian pid ${creator.guardian.state?.pid ?? '(unknown)'}`)
    : finding('info', 'guardian', 'external Guardian is not running'))
  if (creator.claims.length > 0) {
    findings.push(finding('info', 'creator-claims', `${creator.claims.length} active Creator+ plugin claim(s)`))
  }
  if (creator.quarantines.length > 0) {
    findings.push(finding('warn', 'creator-quarantine', `${creator.quarantines.length} plugin quarantine(s) await a checked retry`))
  }
  printReport(report('status', findings, { host: state, discovery, creator }), options.json)
  return 0
}

export async function cmdLogs(args: string[], options: CliOptions, root: string): Promise<number> {
  const state = currentHost(root)
  const last = !state ? readLastHost(root) : undefined
  const logFile = state?.logFile ?? last?.logFile ?? hostLogPath(root, options.profile)
  if (!existsSync(logFile)) {
    printReport(report('logs', [finding('error', 'log', `no log at ${logFile}. run dshx verify-boot or dshx start first`)], { logFile }), options.json)
    return 1
  }
  if (!state && !options.json) {
    const label = last?.profile ?? options.profile
    process.stdout.write(`# last ${label} launcher log (host idle — verify-boot/stop keeps this file)\n`)
  }
  if (options.follow) {
    await followLog(logFile, options.grep ?? args[0])
    return 0
  }
  let text = readLogTail(logFile, 120)
  const grep = options.grep ?? args[0]
  if (grep) text = text.split('\n').filter(line => line.includes(grep)).join('\n')
  if (options.json) {
    printReport(report('logs', [finding('ok', 'tail', logFile)], { text }), true)
    return 0
  }
  process.stdout.write(`${text}\n`)
  return 0
}

export async function cmdVerify(args: string[], options: CliOptions, root: string): Promise<number> {
  const command = 'verify-boot'
  const name = args[0]
  if (!name) {
    printReport(report(command, [finding('error', 'usage', 'dshx verify-boot <plugin>')]), options.json)
    return 1
  }
  if (options.keep) {
    printReport(report(command, [finding('error', 'keep-unsafe', '--keep is not available for isolated verification', {
      hint: 'verify-boot now always stops its temporary Host and removes its temporary DSH_HOME so it cannot become a second long-lived writer',
    })]), options.json)
    return 1
  }
  const { checkPlugin } = await import('../internal/check.ts')
  let plugin
  try {
    plugin = loadPlugin(root, name)
  } catch (error) {
    printReport(report(command, [finding('error', 'plugin', error instanceof Error ? error.message : String(error))]), options.json)
    return 1
  }
  const findings = checkPlugin(plugin, root)
  findings.unshift(finding('info', 'scope', 'isolated cold-boot proof only; this command does not attest or mutate an existing live host'))
  if (findings.some(item => item.level === 'error')) {
    printReport(report(command, findings), options.json)
    return 1
  }
  const already = currentHost(root)
  if (already) findings.push(finding('ok', 'active-host-preserved', `live Host pid ${already.pid} remains untouched while verification uses another DSH_HOME`))
  const isolatedHome = mkdtempSync(join(tmpdir(), 'dshx-verify-home-'))
  const isolatedEnv = { ...dshEnv(root), DSH_HOME: isolatedHome }
  let cleanupHome = true
  let overlay: string | undefined
  try {
    const profileDump = dumpConfig(root, options.profile, [], isolatedEnv)
    if (profileDump.code !== 0) {
      findings.push(finding('error', 'profile-init', `temporary ${options.profile} profile initialization exited ${profileDump.code}`))
      printReport(report(command, findings), options.json)
      return 1
    }
    ensureRuntimePackageLink(plugin, isolatedHome, options.profile)
    const profileEntries = parseDumpEntries(profileDump.stdout)
    const alreadyComposed = profileEntries.some(entry => entry.id === plugin.id)
    overlay = alreadyComposed ? undefined : writeOverlay(root, plugin)
    const dumped = alreadyComposed ? profileDump : dumpConfig(root, options.profile, [overlay!], isolatedEnv)
    const entries = dumped.code === 0 ? parseDumpEntries(dumped.stdout) : []
    findings.push(dumped.code === 0
      ? finding('ok', 'dump-config', 'dump-config exited 0 in the temporary DSH_HOME')
      : finding('error', 'dump-config', `dump-config exited ${dumped.code}`))
    const hit = entries.find(entry => entry.id === plugin.id)
    findings.push(hit
      ? finding('ok', 'dump-id', `temporary composed tree contains id ${plugin.id}`)
      : finding('error', 'dump-id', `id ${plugin.id} missing from temporary dump-config`))
    findings.push(finding('info', 'dump-limit', 'dump-config does not import plugins; a clean composition is only a precondition for isolated cold boot'))
    if (alreadyComposed) findings.push(finding('info', 'overlay-skipped', `id ${plugin.id} is already in the default temporary composition; skipped duplicate verify overlay`))

    if (findings.some(item => item.level === 'error')) {
      findings.push(finding('info', 'boot-skipped', 'isolated cold boot skipped because offline composition failed'))
      printReport(report(command, findings), options.json)
      return 1
    }

    if (options.profile === 'web' && await probePort(options.port) !== 'closed') {
      findings.push(finding('error', 'port', `port ${options.port} is busy or cannot be proved free`, {
        hint: 'retry with another port; isolated DSH_HOME prevents shared state, but DSHX still refuses an unknown listener',
      }))
      printReport(report(command, findings), options.json)
      return 1
    }

    const state = startTransientHost(root, {
      profile: options.profile,
      port: options.port,
      overlay,
      plugin: plugin.id,
      extraArgs: options.profile === 'headless' ? [options.task ?? 'reply with the single word pong and stop'] : undefined,
      env: isolatedEnv,
      logFile: join(root, '.dshx', 'logs', `verify-${plugin.id}-${process.pid}-${Date.now()}.log`),
    })
    const bootDeadline = options.timeoutMs
    let markerOk = false
    let failed = false
    try {
      const webClientPackage = options.profile === 'web' && plugin.runtimePackage?.webClient === true
        ? plugin.runtimePackage
        : undefined
      if (webClientPackage) {
        findings.push(finding('info', 'boot-marker', 'Web client activation is proved by the temporary client graph and served bundle'))
      } else if (plugin.marker) {
        markerOk = await waitForLog(state.logFile, plugin.marker, bootDeadline)
        findings.push(markerOk
          ? finding('ok', 'boot-marker', `startup log contains ${plugin.marker}`)
          : finding('error', 'boot-marker', `marker not seen within ${bootDeadline}ms: ${plugin.marker}`))
      } else {
        findings.push(finding('error', 'boot-marker', 'no marker configured; isolated boot cannot prove apply() ran'))
      }
      if (options.profile === 'web') {
        const httpOk = await waitForHttp(options.port, bootDeadline)
        findings.push(httpOk
          ? finding('ok', 'http', `http://127.0.0.1:${options.port}/ accepted a request from the temporary Host`)
          : finding('error', 'http', `temporary Web Host did not accept HTTP within ${bootDeadline}ms`))
        if (httpOk && webClientPackage) {
          const baseUrl = `http://127.0.0.1:${options.port}/`
          const page = await fetch(baseUrl)
          const html = await page.text()
          const clientPath = `/plugins/${webClientPackage.name}/client.js`
          const rowPattern = new RegExp(`(${clientPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?rev=[^"'<\\s]+)`)
          const row = rowPattern.exec(html)?.[1]
          findings.push(row
            ? finding('ok', 'client-graph', `temporary __DSH_BOOT__ contains ${webClientPackage.name}`)
            : finding('error', 'client-graph', `temporary __DSH_BOOT__ is missing ${webClientPackage.name}`))
          let bundleOk = false
          if (row) {
            const bundle = await fetch(new URL(row, baseUrl))
            const bytes = Buffer.byteLength(await bundle.text())
            bundleOk = bundle.ok && bytes > 0
            findings.push(bundleOk
              ? finding('ok', 'client-http', `${row} returned ${bundle.status} (${bytes} bytes)`)
              : finding('error', 'client-http', `${row} returned ${bundle.status} (${bytes} bytes)`))
          }
          markerOk = row !== undefined && bundleOk
        }
      }
      failed = logContains(state.logFile, 'duplicate loader entry id')
        || logContains(state.logFile, 'Failed to load plugins')
        || logContains(state.logFile, 'cannot resolve profile bundle')
      if (failed) findings.push(finding('error', 'boot-log', 'temporary Host log contains a known brick phrase'))
    } finally {
      try {
        await stopTransientHost(state)
      } catch (error) {
        cleanupHome = false
        throw error
      }
    }

    if (!markerOk || failed) findings.push(finding('info', 'log-tail', 'recent temporary launcher log'))
    findings.push(finding('ok', 'isolated-home', 'temporary Host used a separate DSH_HOME and was stopped'))
    findings.push(finding('info', 'live-limit', 'cold boot success is not current-host activation proof; classify and verify the live branch separately'))
    const result = report(command, findings, {
      logFile: state.logFile,
      overlay,
      isolatedHomeRemoved: true,
      ...(!markerOk || failed) ? { tail: readLogTail(state.logFile, 40) } : {},
    })
    printReport(result, options.json)
    return result.ok ? 0 : 1
  } catch (error) {
    findings.push(finding('error', 'isolated-boot', error instanceof Error ? error.message : String(error)))
    if (!cleanupHome) findings.push(finding('warn', 'isolated-home-preserved', `temporary DSH_HOME was preserved because its Host could not be proved stopped: ${isolatedHome}`))
    printReport(report(command, findings, { overlay, isolatedHomeRemoved: cleanupHome }), options.json)
    return 1
  } finally {
    if (cleanupHome) rmSync(isolatedHome, { recursive: true, force: true })
  }
}
