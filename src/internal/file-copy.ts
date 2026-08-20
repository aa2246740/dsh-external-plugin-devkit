import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { finding, loadJson } from './io.ts'
import type { Finding, ProfileName } from './types.ts'
import { profileDir, resolveDshHome } from './paths.ts'

interface PackageJson {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  dsh?: {
    client?: {
      platform?: unknown
      inject?: unknown
      external?: unknown
    }
  }
  exports?: Record<string, unknown>
}

const CLIENT_BASELINE = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-runtime/client',
])

export function resolveFileSpec(spec: string, fromDir: string): string | undefined {
  if (!spec.startsWith('file:')) return undefined
  return resolve(fromDir, spec.slice('file:'.length))
}

export function resolveLocalSpec(spec: string, fromDir: string): string | undefined {
  if (spec.startsWith('file:')) return resolve(fromDir, spec.slice('file:'.length))
  if (spec.startsWith('link:')) return resolve(fromDir, spec.slice('link:'.length))
  return undefined
}

export function newestMtime(dir: string): number {
  if (!existsSync(dir)) return 0
  let newest = statSync(dir).mtimeMs
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const name of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, name.name)
      if (name.isDirectory()) {
        if (name.name === 'node_modules' || name.name === '.git') continue
        stack.push(path)
        continue
      }
      const stamp = statSync(path).mtimeMs
      if (stamp > newest) newest = stamp
    }
  }
  return newest
}

export function treeHash(dir: string): string | undefined {
  if (!existsSync(dir)) return undefined
  const files: string[] = []
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const path = join(current, entry.name)
      if (entry.isDirectory()) stack.push(path)
      else files.push(path)
    }
  }
  const hash = createHash('sha256')
  for (const path of files.sort()) {
    hash.update(relative(dir, path))
    hash.update('\0')
    hash.update(readFileSync(path))
    hash.update('\0')
  }
  return hash.digest('hex')
}

export function staleFileCopyFindings(profile: ProfileName): Finding[] {
  const prof = profileDir(resolveDshHome(), profile)
  const manifestPath = join(prof, 'package.json')
  if (!existsSync(manifestPath)) return []
  const manifest = loadJson<PackageJson>(manifestPath)
  const findings: Finding[] = []
  for (const [name, spec] of Object.entries(manifest.dependencies ?? {})) {
    const source = resolveFileSpec(spec, prof)
    if (!source) continue
    const installed = join(prof, 'node_modules', name)
    if (!existsSync(source)) {
      findings.push(finding('error', 'stale-file-copy', `file: source for ${name} is missing`, {
        path: source,
        hint: 'dshx sync-artifact <dir> after the package exists on disk',
      }))
      continue
    }
    if (!existsSync(installed)) {
      findings.push(finding('warn', 'stale-file-copy', `${name} is a file: dep but is not installed in the profile`, {
        path: installed,
        hint: `dshx sync-artifact ${source}`,
      }))
      continue
    }
    const sourcePkg = loadJson<PackageJson>(join(source, 'package.json'))
    const installedPkg = loadJson<PackageJson>(join(installed, 'package.json'))
    const sourceLib = join(source, 'lib')
    const installedLib = join(installed, 'lib')
    const versionDrift = (sourcePkg.version ?? '') !== (installedPkg.version ?? '')
    const libDrift = existsSync(sourceLib) && newestMtime(sourceLib) > newestMtime(installedLib) + 1000
    if (versionDrift || libDrift) {
      findings.push(finding('error', 'stale-file-copy', `${name} profile copy is older than the file: source`, {
        path: installed,
        hint: `dsh plugin add file: reports "Already up to date" without recopying lib/. Run: dshx sync-artifact ${source}`,
      }))
    } else {
      findings.push(finding('ok', 'stale-file-copy', `${name} file: copy matches the source (${sourcePkg.version ?? 'no version'})`))
    }
  }
  return findings
}

export function clientEntryFindings(pluginDir: string): Finding[] {
  const pkgPath = join(pluginDir, 'package.json')
  if (!existsSync(pkgPath)) return []
  const pkg = loadJson<PackageJson>(pkgPath)
  if (pkg.dsh?.client === undefined && pkg.exports?.['./client'] === undefined) return []
  const findings: Finding[] = []
  const declaration = pkg.dsh?.client
  if (declaration === undefined) {
    findings.push(finding('error', 'client-declaration', 'package exports ./client but does not declare dsh.client', { path: pkgPath }))
  } else {
    if (declaration.platform === 'web') {
      findings.push(finding('ok', 'client-platform', 'dsh.client.platform is web'))
    } else {
      findings.push(finding('error', 'client-platform', 'dsh.client.platform must be web', { path: pkgPath }))
    }
    findings.push(...clientStringArrayFindings('inject', declaration.inject, pkgPath))
    findings.push(...clientStringArrayFindings('external', declaration.external, pkgPath, CLIENT_BASELINE))
  }

  const buildConfigPath = join(pluginDir, 'tsdown.config.ts')
  if (existsSync(buildConfigPath)) {
    const buildConfig = readFileSync(buildConfigPath, 'utf8')
    if (/packages\/client\/tsdown\.client/.test(buildConfig)) {
      findings.push(finding('error', 'rc8-external-client-build', 'RC8 repository clientBundle only accepts packages/*/* and cannot build my-plugins/*', {
        path: buildConfigPath,
        hint: "import externalClientBundle from '../../tools/dshx/src/client-build.js' instead",
      }))
    } else if (buildConfig.includes('externalClientBundle')) {
      findings.push(finding('ok', 'rc8-external-client-build', 'uses the RC8 out-of-tree dshx client bundle adapter', { path: buildConfigPath }))
    }
  }
  const clientExport = pkg.exports?.['./client']
  const declared = typeof clientExport === 'string'
    ? clientExport
    : clientExport && typeof clientExport === 'object' && typeof (clientExport as { default?: unknown }).default === 'string'
      ? (clientExport as { default: string }).default
      : './lib/client.js'
  const abs = resolve(pluginDir, declared)
  if (existsSync(abs)) {
    if (!declared.endsWith('.js')) {
      findings.push(finding('error', 'client-entry-format', `client export must target a built .js artifact, not ${declared}`, {
        path: abs,
        hint: 'build the browser half to lib/client.js with the official lazy-CJS handoff',
      }))
      return findings
    }
    const source = readFileSync(abs, 'utf8')
    if (!source.includes('window.__ModuleLoader__.load') || !/factory\s*:/.test(source)) {
      findings.push(finding('error', 'client-entry-format', `${declared} is not a DSH lazy-CJS client bundle`, {
        path: abs,
        hint: 'the artifact must register window.__ModuleLoader__.load({ id, factory })',
      }))
      return findings
    }
    const registered = source.match(/__ModuleLoader__\.load\(\{\s*id\s*:\s*['"]([^'"]+)['"]/u)?.[1]
    if (registered !== undefined && pkg.name !== undefined && registered !== pkg.name) {
      findings.push(finding('error', 'client-entry-id', `client bundle registers ${registered}, but package name is ${pkg.name}`, {
        path: abs,
        hint: 'the lazy-CJS registration id must exactly match package.json name',
      }))
      return findings
    }
    findings.push(finding('ok', 'client-entry', `built lazy-CJS client entry exists: ${declared}`))
    return findings
  }
  const mjs = abs.replace(/\.js$/, '.mjs')
  const mjsCjs = abs.replace(/\.js$/, '.cjs')
  if (existsSync(mjs) || existsSync(mjsCjs)) {
    findings.push(finding('error', 'client-entry', `client entry ${declared} is missing; a ${existsSync(mjs) ? '.mjs' : '.cjs'} sibling exists`, {
      path: abs,
      hint: 'the web host loads the .js path from package.json. copy or wrap the build output to that name',
    }))
    return findings
  }
  findings.push(finding('error', 'client-entry', `client entry missing: ${declared}`, { path: abs }))
  return findings
}

function clientStringArrayFindings(
  field: 'inject' | 'external',
  value: unknown,
  path: string,
  forbidden: ReadonlySet<string> = new Set(),
): Finding[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.length === 0)) {
    return [finding('error', `client-${field}`, `dsh.client.${field} must be an array of non-empty strings`, { path })]
  }
  const duplicate = value.find((item, index) => value.indexOf(item) !== index)
  if (duplicate !== undefined) {
    return [finding('error', `client-${field}`, `dsh.client.${field} contains duplicate ${duplicate}`, { path })]
  }
  const repeatedBaseline = value.find(item => forbidden.has(item))
  if (repeatedBaseline !== undefined) {
    return [finding('error', `client-${field}`, `dsh.client.${field} repeats RC8 baseline module ${repeatedBaseline}`, {
      path,
      hint: 'remove it; the Web shell already provides baseline modules',
    })]
  }
  return [finding('ok', `client-${field}`, `dsh.client.${field} is normalized`)]
}
