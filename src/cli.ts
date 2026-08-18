#!/usr/bin/env node
import { HELP, LOOP } from './help.ts'
import { cmdCheck } from './commands/check.ts'
import { cmdDoctor } from './commands/doctor.ts'
import { cmdDump } from './commands/dump.ts'
import { cmdRestart, cmdStart, cmdStatus, cmdStop, cmdLogs, cmdVerify } from './commands/host.ts'
import { cmdInit } from './commands/init.ts'
import { cmdKb } from './commands/kb.ts'
import { cmdOverlay } from './commands/overlay.ts'
import { cmdSession } from './commands/session.ts'
import { cmdWhich } from './commands/which.ts'
import { cmdExperiment } from './commands/experiment.ts'
import { cmdSetup } from './commands/setup.ts'
import { cmdShip } from './commands/ship.ts'
import { finding, parseCli, printReport, report } from './internal/io.ts'
import { logObserve } from './internal/observe.ts'
import { findRepoRoot } from './internal/paths.ts'
import { DSHX_VERSION } from './internal/types.ts'

async function main(): Promise<number> {
  const raw = process.argv.slice(2)
  if (raw.some(token => token === '--help' || token === '-h')) {
    process.stdout.write(HELP)
    return 0
  }
  const { command, args, options } = parseCli(raw)
  if (command === 'help') {
    process.stdout.write(HELP)
    return 0
  }
  if (command === 'version' || command === '-V' || command === '--version') {
    process.stdout.write(`dshx ${DSHX_VERSION}\n`)
    return 0
  }
  if (command === 'loop') {
    process.stdout.write(LOOP)
    return 0
  }
  if (command === 'setup') {
    return cmdSetup(args, options)
  }

  let root: string
  try {
    root = findRepoRoot()
  } catch (error) {
    printReport(report(command, [finding('error', 'root', error instanceof Error ? error.message : String(error))]), options.json)
    return 1
  }

  logObserve(root, { kind: 'cli', command, args, json: options.json })

  switch (command) {
    case 'kb':
    case 'okf':
      return cmdKb(args, options, root)
    case 'init':
      return cmdInit(args, options, root)
    case 'check':
      return cmdCheck(args, options, root)
    case 'overlay':
      return cmdOverlay(args, options, root)
    case 'dump':
      return cmdDump(args, options, root)
    case 'start':
      return cmdStart(args, options, root)
    case 'stop':
      return cmdStop(args, options, root)
    case 'restart':
      return cmdRestart(args, options, root)
    case 'status':
      return cmdStatus(args, options, root)
    case 'logs':
      return cmdLogs(args, options, root)
    case 'verify':
      return cmdVerify(args, options, root)
    case 'doctor':
      return cmdDoctor(args, options, root)
    case 'session':
      return cmdSession(args, options)
    case 'which':
      return cmdWhich(args, options, root)
    case 'experiment':
      return cmdExperiment(args, options, root)
    case 'ship':
    case 'recopy':
      return cmdShip(args, options, root)
    default:
      printReport(report(command, [
        finding('error', 'unknown', `unknown command: ${command}`),
        finding('info', 'hint', 'dshx help   or   dshx kb'),
      ]), options.json)
      return 2
  }
}

main().then(code => {
  process.exitCode = code
}, error => {
  process.stderr.write(`dshx: ${error instanceof Error ? error.message : error}\n`)
  process.exitCode = 1
})
