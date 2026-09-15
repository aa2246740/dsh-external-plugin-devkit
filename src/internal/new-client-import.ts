import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { currentHost } from './host.ts'
import { readProcessStartTime } from './host-discovery.ts'
import { artifactStates, packageExportTarget } from './hot-reload.ts'
import { writeWatchedPatch } from './new-client.ts'
import { profileDir, resolveDshHome } from './paths.ts'
import type { PluginManifest } from './types.ts'

const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

/** Refresh only an unmounted package's declared files through official HMR.
 * Import success is still proved by the caller's live client-manifest check.
 */
export async function prepareNewClientImport(root: string, plugin: PluginManifest, port: number, timeoutMs: number) {
  const home = realpathSync(resolveDshHome()), hostRoot = realpathSync(root)
  const host = currentHost(root)
  if (!host || host.profile !== 'web' || host.port !== port || host.home !== home || host.hostRoot !== hostRoot) {
    throw new Error('new-client import preparation requires the identified current Web Host')
  }
  const assertHost = () => {
    const now = currentHost(root), start = readProcessStartTime(host.pid)
    if (!now || now.pid !== host.pid || now.processStartedAt !== host.processStartedAt
      || !start.ok || start.text !== host.processStartedAt) throw new Error('new-client import Host identity changed')
  }
  assertHost()
  const packageDir = realpathSync(plugin.dir)
  if (packageDir.split(sep).includes('node_modules') || ['apps', 'packages', 'vendor'].some(name => packageDir === join(hostRoot, name) || packageDir.startsWith(join(hostRoot, name) + sep))) {
    throw new Error('new-client import preparation refuses shared Harness code')
  }
  const entryPath = realpathSync(resolve(packageDir, packageExportTarget(plugin)))
  if (!entryPath.startsWith(packageDir + sep)) throw new Error('new-client runtime entry escapes its checked package')
  const artifacts = artifactStates(plugin, packageDir, entryPath)
  const transactionId = randomUUID(), suffix = transactionId.replaceAll('-', '')
  const hmrEntryId = `dshx-hot-reload-hmr-${suffix}`
  const directory = mkdtempSync(join(tmpdir(), 'dshx-client-import-'))
  const reportPath = join(directory, 'report.json'), observer = join(directory, 'observer.mjs')
  const runtime = fileURLToPath(new URL('../runtime/', import.meta.url))
  copyFileSync(join(runtime, 'new-client-import-observer.mjs'), observer)
  copyFileSync(join(runtime, 'hot-reload-hmr-audit.mjs'), join(directory, 'hot-reload-hmr-audit.mjs'))
  const patchPath = join(profileDir(home, 'web'), 'cordis.patch.yml')
  const config = { transactionId, pluginId: plugin.id, expectedPid: host.pid, hmrEntryId, entryPath, targetFiles: artifacts.map(item => item.absolutePath), reportPath }
  const block = `\n# dshx import preparation ${transactionId}\n- insert:\n    - id: ${hmrEntryId}\n      name: '@deepseek-ai/cordis-plugin-hmr'\n      isolate:\n        hmr: true\n      config:\n        base: ${JSON.stringify(packageDir)}\n        root: ${JSON.stringify(artifacts.map(item => item.path))}\n        ignored: []\n        debounce: 50\n    - id: dshx-import-observer-${suffix}\n      name: ${JSON.stringify(observer)}\n      config: ${JSON.stringify(config)}\n# dshx import preparation end ${transactionId}\n`
  const deadline = Date.now() + Math.min(timeoutMs, 20_000)
  const beforePatch = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  const preparedPatch = beforePatch.replace(/^([ \t]*)\[[ \t]*\]([ \t]*(?:#[^\r\n]*)?)\r?$/m, '$1$2')
  const read = () => {
    if (!existsSync(reportPath)) return undefined
    const row = JSON.parse(readFileSync(reportPath, 'utf8'))
    if (row.transactionId !== transactionId || row.pluginId !== plugin.id || row.pid !== host.pid) throw new Error('new-client import observer identity mismatch')
    return row
  }
  const wait = async (accept: (row: any) => boolean, until: number) => {
    while (Date.now() < until) {
      const row = read()
      if (row?.phase === 'FAILED') throw new Error(row.error)
      if (row && accept(row)) return row
      await new Promise(resolveWait => setTimeout(resolveWait, 50))
    }
    throw new Error('timed out preparing the new-client import')
  }
  let result, failure, disposed = false, mounted = false
  try {
    if (preparedPatch.trimEnd().endsWith('...')) throw new Error('import preparation refuses an explicit YAML document terminator')
    writeWatchedPatch(patchPath, preparedPatch + block)
    mounted = true
    const ready = await wait(row => row.phase === 'READY' || row.phase === 'ALREADY_MOUNTED', deadline)
    if (ready.phase === 'ALREADY_MOUNTED') result = ready
    else {
      assertHost()
      for (const artifact of artifacts) {
        if (hash(artifact.absolutePath) !== artifact.before) throw new Error('source changed while preparing its import')
        const at = new Date(Math.max(Date.now(), statSync(artifact.absolutePath).mtimeMs + 1_500))
        utimesSync(artifact.absolutePath, at, at)
      }
      result = await wait(row => row.phase === 'IMPORT_READY', deadline)
      for (const artifact of artifacts) if (hash(artifact.absolutePath) !== artifact.before) throw new Error('source changed during import preparation')
    }
  } catch (error) { failure = error }
  finally {
    if (mounted) {
      const current = readFileSync(patchPath, 'utf8')
      if (!current.includes(block)) throw new Error(`import preparation block changed; preserve ${directory} for diagnosis`)
      const cleaned = current.replace(block, '')
      writeWatchedPatch(patchPath, cleaned === preparedPatch ? beforePatch : cleaned)
    }
    try {
      // Disposal can retain a FAILED phase; inspect its own completion field.
      const until = Date.now() + 5_000
      while (mounted && Date.now() < until) {
        if (read()?.disposed === true) { disposed = true; break }
        await new Promise(resolveWait => setTimeout(resolveWait, 50))
      }
      assertHost()
    } catch (error) { failure ??= error }
  }
  if (!disposed || failure) throw new Error(`${failure instanceof Error ? failure.message : 'import observer cleanup unproved'}; evidence preserved at ${directory}`)
  rmSync(directory, { recursive: true, force: true })
  return { phase: result.phase, evidence: result.evidence, hostPid: host.pid, cleanupProved: true, artifactHashes: artifacts.map(item => ({ path: item.path, sha256: item.before })) }
}
