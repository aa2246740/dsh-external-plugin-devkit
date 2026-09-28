/** Read-only disk composition through the selected Harness' public boot API.
 * This starts no Host, writes no profile, and is not evidence of live activation.
 */
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'

if (process.env.DSH_SHELL || process.env.DSHX_CREATOR_CONTEXT) throw new Error('Managed desktop inspection requires the current Creator+ bridge')
if (process.argv.length !== 3) throw new Error('Expected one selected Harness root')
const root = resolve(process.argv[2])
const anchor = join(root, 'apps/cli/package.json')
const require = createRequire(anchor)
const boot = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href)
const home = resolve(process.env.DSH_HOME || join(homedir(), '.dsh'))
const dir = join(home, 'profiles/desktop')
const profile = boot.loadProfileDirectory('dshx', dir, anchor, { userLayer: false })
if (profile.skippedBundles.length) throw new Error(`Desktop profile has unresolved bundles: ${profile.skippedBundles.map(row => row.packageName).join(', ')}`)
const rows = boot.composeEntries([boot.readProfilePatches('dshx', {
  name: 'desktop', dir, patchPath: join(dir, 'cordis.patch.yml'), installAnchor: anchor,
  cwd: root, home, startedBundles: profile.layers.map(layer => layer.packageName), overlays: [],
  telemetryDisabledEnv: process.env.DSH_TELEMETRY_DISABLED,
}, profile)])
// Config values and credential references must never enter the external report.
for (const { id, name, disabled } of rows) {
  if (!/^[a-zA-Z0-9@._/-]+$/.test(id)) throw new Error('Unsupported profile row identity')
  process.stdout.write(`- id: ${id}\n${name ? `  name: ${JSON.stringify(name)}\n` : ''}${disabled ? '  disabled: true\n' : ''}`)
}
