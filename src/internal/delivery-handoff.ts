import { spawnSync } from 'node:child_process'
import type { HostState } from './types.ts'

/** Identity is useful before an activation decision; restart instructions are not. */
export function identityOnlyHandoff(handoff: ReturnType<typeof restartHandoff>) {
  return {
    ...handoff,
    status: handoff.status === 'TARGET_UNPROVEN' ? 'TARGET_UNPROVEN' : 'TARGET_IDENTIFIED',
    instructions: ['Keep this Host running. Launcher identity does not authorize a restart; use the selected activation branch and obtain runtime evidence.'],
  }
}

export function launcherExecutable(host: HostState | undefined): string | undefined {
  if (!host?.launcherPid) return undefined
  const result = spawnSync('ps', ['-p', String(host.launcherPid), '-o', 'comm='], { encoding: 'utf8', timeout: 2_000 })
  return result.status === 0 ? result.stdout.trim() || undefined : undefined
}

/** Instructions only. Never signals or starts a process. */
export function restartHandoff(host: HostState | undefined, executable?: string) {
  const appPath = executable?.match(/^(.*\.app)\/Contents\/MacOS\//)?.[1]
  const launcher = !host ? 'unknown' : host.ownership === 'spawned' ? 'dshx' : appPath ? 'app' : executable ? 'cli' : 'unknown'
  return {
    status: host && launcher !== 'unknown' ? 'AWAITING_LAUNCHER_RESTART' : 'TARGET_UNPROVEN',
    launcher,
    appPath,
    pid: host?.pid,
    processStartedAt: host?.processStartedAt,
    port: host?.port,
    home: host?.home,
    harnessRoot: host?.hostRoot,
    ownership: host?.ownership,
    instructions: launcher === 'app'
      ? ['Outside this DSH session, quit the identified App normally, wait for its Host to exit, then reopen the same App. Closing its window is not quitting.', 'Resume this same conversation and call dshx_status; verify the changed plugin in the existing App UI.']
      : launcher === 'cli'
        ? ['Outside this DSH session, stop dsh web in its original terminal or service manager, wait for that Host to exit, then rerun the original launcher with the same Home, profile and port.', 'Reopen the same WebUI URL, resume this conversation and call dshx_status. Do not start an additional same-Home Host.']
        : launcher === 'dshx'
          ? ['An external supervisor may run dshx restart-supervised against this exact Harness after approval.', 'Resume this conversation and call dshx_status, then verify the actual plugin behavior.']
          : ['Launcher identity is unproved. An external supervisor must identify the current launcher; do not guess an App path or start another Host.'],
    completion: 'LIVE_ACTIVATION_UNPROVEN: a changed PID, HTTP 200 or successful build alone is not functional acceptance',
  }
}
