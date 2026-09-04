/** Creator Mode+ claim tracking and last-mile destructive-shell guard. */

const claimedPlugins = new WeakMap()
const PLUGIN_ID = /^[a-z][a-z0-9-]*$/

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function sessionWorkspace(exec) {
  const cwd = exec?.agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd.startsWith('/') ? cwd.replace(/\/$/, '') : undefined
}

function destructiveShell(command) {
  return /(?:^|[;&|()\n]\s*)(?:(?:command|env|sudo)\s+)*(?:(?:\/[\w@.+-]+)+\/)?(?:rm|rmdir|unlink|mv)\b/.test(command)
}

function containsPath(command, path) {
  return command.includes(path)
    || command.includes(JSON.stringify(path))
    || command.includes(`'${path.replaceAll("'", "'\\''")}'`)
}

export function rememberCreatorClaim(exec, pluginId) {
  if (exec?.agent && PLUGIN_ID.test(pluginId)) claimedPlugins.set(exec.agent, pluginId)
}

export function forgetCreatorClaim(exec) {
  if (exec?.agent) claimedPlugins.delete(exec.agent)
}

export function claimedCreatorPlugin(exec) {
  return exec?.agent ? claimedPlugins.get(exec.agent) : undefined
}

export function creatorDestructiveCommandReason(exec, explicitPluginId) {
  if (exec?.name !== 'bash') return undefined
  const args = record(exec?.arguments)
  const command = typeof args?.command === 'string' ? args.command : undefined
  if (!command || !destructiveShell(command)) return undefined

  if (/(?:^|[\s'"=])(?:\/Users\/[^/]+\/)?\.dsh\/profiles(?:\/|[\s'";]|$)/.test(command)
    || /\/\.dsh\/profiles(?:\/|[\s'";]|$)/.test(command)) {
    return 'Creator Mode+ blocks direct teardown of the active DSH profile. Use dshx_remove_plugin so the live Host row is removed before its profile dependency.'
  }

  const pluginId = explicitPluginId ?? claimedCreatorPlugin(exec)
  if (!pluginId) return undefined
  const workspace = sessionWorkspace(exec)
  const pluginRoot = workspace ? `${workspace}/${pluginId}` : undefined
  const escapedId = pluginId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const removesClaimedRelativeRoot = new RegExp(`(?:^|[\\s'"=;])(?:\\.\\/)?${escapedId}(?:[\\s'";]|$)`).test(command)
  const removesCurrentRoot = workspace?.endsWith(`/${pluginId}`) === true
    && /(?:^|[;&|()\n]\s*)(?:(?:command|env|sudo)\s+)*(?:(?:\/[\w@.+-]+)+\/)?(?:rm|rmdir|unlink|mv)\s+(?:-[^\s]+\s+)*(?:\.|\.\/)(?:[\s;]|$)/.test(command)
  if (command.includes(`/my-plugins/${pluginId}`)
    || (pluginRoot ? containsPath(command, pluginRoot) : false)
    || removesClaimedRelativeRoot
    || removesCurrentRoot) {
    return `Creator Mode+ blocks direct teardown of claimed plugin ${pluginId}. Use dshx_remove_plugin; it deactivates the live Host first and preserves source.`
  }
  return undefined
}

export function installCreatorSafetyGuard(ctx) {
  if (typeof ctx?.tools?.guard !== 'function') return
  ctx.tools.guard(exec => creatorDestructiveCommandReason(exec))
}
