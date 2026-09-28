import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readCreatorContext } from './creator.ts'
import type { DshResult } from './dsh.ts'

/** Only the calling Host can issue this short-lived profile-operation capability. */
export function desktopProfileCommand(args: readonly string[], timeoutMs: number): DshResult {
  const context = readCreatorContext()
  const access = JSON.parse(process.env.DSHX_DESKTOP_PROFILE_ACCESS || 'null')
  if (context?.hostProfile !== 'desktop' || !access || access.hostPid !== context.hostPid || access.port !== context.hostPort || !/^[a-f0-9]{64}$/.test(access.token)) {
    return { code: 1, stdout: '', stderr: 'DESKTOP_PROFILE_BRIDGE_REQUIRED: use the current Creator+ fixed tool' }
  }
  let operation: object
  if (args.includes('--dump-config') && args.length === 3) operation = { operation: 'dump' }
  else if (args.length === 5 && args[0] === 'plugin' && args[1] === '--profile' && args[2] === 'desktop' && ['add', 'remove'].includes(args[3]!)) {
    const contextId = process.env.DSHX_DESKTOP_PLUGIN_ID
    if (!contextId || !/^[a-z][a-z0-9-]*$/.test(contextId)) return { code: 1, stdout: '', stderr: 'DESKTOP_PROFILE_PLUGIN_ID_REQUIRED' }
    operation = { operation: args[3], pluginId: contextId }
  } else return { code: 1, stdout: '', stderr: 'Unsupported desktop profile operation' }
  const result = spawnSync(process.execPath, ['--import', createRequire(import.meta.url).resolve('tsx/esm'), fileURLToPath(new URL('../runtime/desktop-profile-request.mjs', import.meta.url))], {
    input: JSON.stringify({ access, operation, timeoutMs }), encoding: 'utf8', timeout: timeoutMs + 1000, maxBuffer: 4 * 1024 * 1024,
  })
  if (result.status !== 0) return { code: 1, stdout: '', stderr: 'Desktop profile bridge request failed or timed out' }
  try { return JSON.parse(result.stdout) as DshResult } catch { return { code: 1, stdout: '', stderr: 'Invalid desktop profile bridge response' } }
}
