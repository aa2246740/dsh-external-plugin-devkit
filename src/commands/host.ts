import { existsSync } from 'node:fs'
import { dumpConfig, parseDumpEntries } from '../internal/dsh.ts'
import { currentHost, followLog, logContains, portOpen, readLastHost, readLogTail, startHost, stopHost, waitForHttp, waitForLog } from '../internal/host.ts'
import { finding, printReport, report } from '../internal/io.ts'
import { writeOverlay } from '../internal/overlay.ts'
import { hostLogPath } from '../internal/paths.ts'
import { loadPlugin } from '../internal/plugin.ts'
import type { CliOptions, PluginManifest, ProfileName } from '../internal/types.ts'

function resolveProfile(args: string[], options: CliOptions): { profile: ProfileName; pluginArg?: string; rest: string[] } {
  if (args[0] === 'web' || args[0] === 'headless') {
    return { profile: args[0], pluginArg: args[1], rest: args.slice(2) }
  }
  return { profile: options.profile, pluginArg: args[0], rest: args.slice(1) }
}

function preparePlugin(root: string, name: string | undefined): { plugin?: PluginManifest; overlay?: string } {
  if (!name) return {}
  const plugin = loadPlugin(root, name)
  return { plugin, overlay: writeOverlay(root, plugin) }
}

export async function cmdStart(args: string[], options: CliOptions, root: string): Promise<number> {
  const { profile, pluginArg, rest } = resolveProfile(args, options)
  try {
    const supervised = currentHost(root)
    if (supervised) {
      printReport(report('start', [finding('error', 'already-supervising', `dshx already supervises pid ${supervised.pid} on port ${supervised.port}`, {
        hint: 'dshx stop or dshx restart. --force does not take over a host you already supervise. never kill dsh from inside a Harness session',
      })]), options.json)
      return 1
    }
    const { plugin, overlay } = preparePlugin(root, pluginArg)
    if (profile === 'headless') {
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
    if (await portOpen(options.port) && !options.force) {
      const supervised = currentHost(root)
      printReport(report('start', [finding('error', 'port', `port ${options.port} already in use`, {
        hint: supervised
          ? 'dshx stop, then start again. never kill dsh from inside a Harness session'
          : `dshx is not supervising this listener. pick a free port: dshx start web <name> --port 3091. do not --force unless you intend to share that process. never kill it from a Harness chat`,
      })]), options.json)
      return 1
    }
    const state = startHost(root, { profile, port: options.port, overlay, plugin: plugin?.id })
    printReport(report('start', [
      finding('ok', 'spawned', `supervising pid ${state.pid} on 127.0.0.1:${state.port}`),
      finding('info', 'next', 'dshx logs --follow   or   dshx verify <name>'),
    ], { logFile: state.logFile, overlay: state.overlay, url: `http://127.0.0.1:${state.port}/` }), options.json)
    return 0
  } catch (error) {
    printReport(report('start', [finding('error', 'start', error instanceof Error ? error.message : String(error))]), options.json)
    return 1
  }
}

export async function cmdStop(_args: string[], options: CliOptions, root: string): Promise<number> {
  const live = currentHost(root)
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
  const previous = live ?? readLastHost(root)
  const stopped = await stopHost(root)
  if (stopped) {
    printReport(report('restart', [
      finding(live ? 'ok' : 'info', live ? 'stopped' : 'already-exited', live
        ? `signaled pid ${stopped.pid}; starting again`
        : `pid ${stopped.pid} already gone; starting again`),
    ]), options.json)
  }
  const nextArgs = args.length > 0
    ? args
    : live?.plugin
      ? [live.profile, live.plugin]
      : previous && 'plugin' in previous && previous.plugin
        ? [previous.profile, previous.plugin]
        : [live?.profile ?? previous?.profile ?? options.profile]
  if (live?.port) options.port = live.port
  else if (previous?.port) options.port = previous.port
  return cmdStart(nextArgs, options, root)
}

export async function cmdStatus(_args: string[], options: CliOptions, root: string): Promise<number> {
  const state = currentHost(root)
  const httpPort = state && state.port > 0 ? state.port : options.port
  const listening = await portOpen(httpPort)
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
    } else if (listening) {
      findings.push(finding('ok', 'listen', `supervised host accepts HTTP on 127.0.0.1:${state.port}`))
    } else {
      findings.push(finding('warn', 'listen', `supervised pid is up but 127.0.0.1:${state.port} is not accepting HTTP yet`))
    }
  } else if (listening) {
    findings.push(finding('warn', 'unsupervised', `127.0.0.1:${httpPort} accepts HTTP but dshx is not supervising it — do not treat this as your plugin host`))
  } else {
    findings.push(finding('info', 'listen', `127.0.0.1:${httpPort} is closed`))
  }
  const last = !state ? readLastHost(root) : undefined
  if (last) {
    if (last.profile === 'headless' || !last.port) {
      findings.push(finding('info', 'last-port', `last workshop host was headless${last.plugin ? ` (${last.plugin})` : ''} and has no HTTP port — do not treat :${httpPort} as that process`))
    } else {
      const lastOpen = last.port === httpPort ? listening : await portOpen(last.port)
      findings.push(lastOpen
        ? finding('warn', 'last-port', `last workshop host was 127.0.0.1:${last.port}${last.plugin ? ` (${last.plugin})` : ''} and that port still accepts HTTP`)
        : finding('info', 'last-port', `last workshop host was 127.0.0.1:${last.port}${last.plugin ? ` (${last.plugin})` : ''} and is now closed`))
    }
  }
  printReport(report('status', findings, state), options.json)
  return 0
}

export async function cmdLogs(args: string[], options: CliOptions, root: string): Promise<number> {
  const state = currentHost(root)
  const last = !state ? readLastHost(root) : undefined
  const logFile = state?.logFile ?? last?.logFile ?? hostLogPath(root, options.profile)
  if (!existsSync(logFile)) {
    printReport(report('logs', [finding('error', 'log', `no log at ${logFile}. run dshx verify or dshx start first`)], { logFile }), options.json)
    return 1
  }
  if (!state && !options.json) {
    const label = last?.profile ?? options.profile
    process.stdout.write(`# last ${label} launcher log (host idle — verify/stop keeps this file)\n`)
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
  const name = args[0]
  if (!name) {
    printReport(report('verify', [finding('error', 'usage', 'dshx verify <plugin>')]), options.json)
    return 1
  }
  const { checkPlugin } = await import('../internal/check.ts')
  let plugin
  try {
    plugin = loadPlugin(root, name)
  } catch (error) {
    printReport(report('verify', [finding('error', 'plugin', error instanceof Error ? error.message : String(error))]), options.json)
    return 1
  }
  const findings = checkPlugin(plugin, root)
  const overlay = writeOverlay(root, plugin)
  const dumped = dumpConfig(root, options.profile, [overlay])
  const entries = dumped.code === 0 ? parseDumpEntries(dumped.stdout) : []
  findings.push(dumped.code === 0
    ? finding('ok', 'dump-config', 'dump-config exited 0')
    : finding('error', 'dump-config', `dump-config exited ${dumped.code}`))
  const hit = entries.find(entry => entry.id === plugin.id)
  findings.push(hit
    ? finding('ok', 'dump-id', `composed tree contains id ${plugin.id}`)
    : finding('error', 'dump-id', `id ${plugin.id} missing from dump-config`))
  findings.push(finding('info', 'dump-limit', 'dump-config does not import plugins; continuing with a real boot'))

  const already = currentHost(root)
  if (already) await stopHost(root)
  if (options.profile === 'web' && await portOpen(options.port) && !options.force) {
    findings.push(finding('error', 'port', `port ${options.port} busy`, {
      hint: currentHost(root)
        ? 'dshx stop, then verify again'
        : `dshx is not supervising this listener. retry with --port 3091 (or another free port). do not --force a stranger process`,
    }))
    printReport(report('verify', findings), options.json)
    return 1
  }

  const state = startHost(root, {
    profile: options.profile,
    port: options.port,
    overlay,
    plugin: plugin.id,
    extraArgs: options.profile === 'headless' ? [options.task ?? 'reply with the single word pong and stop'] : undefined,
  })
  const bootDeadline = options.timeoutMs
  let markerOk = false
  if (plugin.marker) {
    markerOk = await waitForLog(state.logFile, plugin.marker, bootDeadline)
    findings.push(markerOk
      ? finding('ok', 'boot-marker', `startup log contains ${plugin.marker}`)
      : finding('error', 'boot-marker', `marker not seen within ${bootDeadline}ms: ${plugin.marker}`))
  } else {
    findings.push(finding('warn', 'boot-marker', 'no marker configured; cannot prove apply() ran'))
  }
  if (options.profile === 'web') {
    const httpOk = await waitForHttp(options.port, bootDeadline)
    findings.push(httpOk
      ? finding('ok', 'http', `http://127.0.0.1:${options.port}/ accepted a request`)
      : finding('error', 'http', `web did not accept HTTP within ${bootDeadline}ms`))
  }
  const failed = logContains(state.logFile, 'duplicate loader entry id')
    || logContains(state.logFile, 'Failed to load plugins')
    || logContains(state.logFile, 'cannot resolve profile bundle')
  if (failed) {
    findings.push(finding('error', 'boot-log', 'boot log contains a known brick phrase'))
  }
  if (!options.keep) await stopHost(root)
  else findings.push(finding('info', 'keep', `host left running pid ${state.pid}`))

  if (!markerOk || failed) {
    findings.push(finding('info', 'log-tail', 'recent launcher log'))
  }
  const result = report('verify', findings, {
    logFile: state.logFile,
    overlay,
    ...(!markerOk || failed) ? { tail: readLogTail(state.logFile, 40) } : {},
  })
  printReport(result, options.json)
  return result.ok ? 0 : 1
}
