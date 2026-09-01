#!/usr/bin/env node
import { clearGuardianState, readGuardianState, runGuardianCycle, writeGuardianState } from './internal/guardian.ts'
import { probePid } from './internal/host.ts'
import { DSHX_VERSION } from './internal/types.ts'

function harnessArgument(argv: string[]): string {
  const index = argv.indexOf('--harness')
  const value = index >= 0 ? argv[index + 1] : undefined
  if (!value || argv.length !== 2) throw new Error('guardian daemon requires exactly --harness <path>')
  return value
}

const root = harnessArgument(process.argv.slice(2))
const existing = readGuardianState(root)
if (existing?.pid && existing.pid !== process.pid) {
  const state = probePid(existing.pid)
  if (state !== 'dead') throw new Error(`guardian already running or inaccessible as pid ${existing.pid} (${state})`)
}

const startedAt = new Date().toISOString()
let running = true
let lastHeartbeatAt = 0
process.once('SIGTERM', () => { running = false })
process.once('SIGINT', () => { running = false })

try {
  while (running) {
    const now = Date.now()
    if (now - lastHeartbeatAt >= 5_000) {
      writeGuardianState(root, {
        pid: process.pid,
        version: DSHX_VERSION,
        startedAt,
        heartbeatAt: new Date(now).toISOString(),
      })
      lastHeartbeatAt = now
    }
    try {
      await runGuardianCycle(root)
    } catch (error) {
      process.stderr.write(`[dshx-guardian] ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    }
    if (running) await new Promise(resolve => setTimeout(resolve, 1_000))
  }
} finally {
  clearGuardianState(root)
}
