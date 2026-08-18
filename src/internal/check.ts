import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { clientEntryFindings } from './file-copy.ts'
import { finding } from './io.ts'
import { pluginSource, readCommittedOverlay } from './plugin.ts'
import type { Finding, PluginManifest } from './types.ts'

const ABS_PATH = /(?:^|['"])(\/(?:workspace|home|Users|opt)\/|\/[A-Za-z]:\\)/
const MACHINE_PATH = /\/workspace\/|\/home\/[^/]+\//

export function checkPlugin(plugin: PluginManifest, repoRoot: string): Finding[] {
  const findings: Finding[] = []
  const source = pluginSource(plugin)
  const rel = relative(repoRoot, plugin.entryAbs)

  if (plugin.inferred) {
    findings.push(finding('info', 'manifest-inferred', 'no dshx.yml; id/entry/marker were inferred', { path: plugin.dir }))
  } else {
    findings.push(finding('ok', 'manifest', 'dshx.yml present', { path: `${relative(repoRoot, plugin.dir)}/dshx.yml` }))
  }

  const hasName = /export\s+const\s+name\s*=/.test(source)
  const hasInject = /export\s+const\s+inject\s*=/.test(source)
  const hasApply = /export\s+function\s+apply\s*\(/.test(source) || /export\s+async\s+function\s+apply\s*\(/.test(source)
  const hasDefault = /export\s+default\s+/.test(source)

  if (plugin.kind === 'function' || plugin.kind === 'tool' || plugin.kind === 'client') {
    if (hasName) findings.push(finding('ok', 'export-name', 'named export `name`', { path: rel }))
    else findings.push(finding('error', 'export-name', 'function plugin must named-export `name`', { path: rel }))
    if (hasInject) findings.push(finding('ok', 'export-inject', 'named export `inject`', { path: rel }))
    else findings.push(finding('warn', 'export-inject', 'no `export const inject` — add `export const inject = []` even when empty', { path: rel }))
    if (hasApply) findings.push(finding('ok', 'export-apply', 'named export `apply`', { path: rel }))
    else findings.push(finding('error', 'export-apply', 'function plugin must named-export `apply`', { path: rel }))
    if (hasDefault) {
      findings.push(finding('error', 'default-export', 'function plugin must not default-export; Loader smoke stays green if default replaces named exports', {
        path: rel,
        hint: 'use export const name / inject / apply only',
      }))
    } else {
      findings.push(finding('ok', 'default-export', 'no default export'))
    }
  }

  if (plugin.kind === 'tool') {
    if (!source.includes('defineTool')) {
      findings.push(finding('error', 'define-tool', 'kind=tool but source has no defineTool', { path: rel }))
    }
    if (!/inject\s*=\s*\[[^\]]*['"]tools['"]/.test(source) && !(plugin.inject ?? []).includes('tools')) {
      findings.push(finding('error', 'inject-tools', 'tool plugin must inject `tools`', { path: rel }))
    } else {
      findings.push(finding('ok', 'inject-tools', 'inject includes tools'))
    }
  }

  if (plugin.marker) {
    if (source.includes(plugin.marker)) {
      findings.push(finding('ok', 'boot-marker', `startup marker present: ${plugin.marker}`, { path: rel }))
    } else {
      findings.push(finding('error', 'boot-marker', `dshx.yml marker not found in source: ${plugin.marker}`, { path: rel }))
    }
  } else {
    findings.push(finding('warn', 'boot-marker', 'no console.log marker; dshx verify cannot prove apply() ran', {
      path: rel,
      hint: "add console.log('[my-plugins/<id>] loaded') and put the same string in dshx.yml marker",
    }))
  }

  const overlay = readCommittedOverlay(plugin.dir)
  if (overlay === undefined) {
    findings.push(finding('info', 'cordis-yml', 'no committed cordis.yml (dshx overlay will generate an absolute --patch file)', { path: plugin.dir }))
  } else if (!Array.isArray(overlay)) {
    findings.push(finding('error', 'cordis-yml', 'cordis.yml must be a top-level YAML array', { path: `${plugin.dir}/cordis.yml` }))
  } else {
    findings.push(finding('ok', 'cordis-yml', 'committed overlay is a YAML array'))
    const text = readCommittedOverlayText(plugin.dir)
    if (MACHINE_PATH.test(text) || ABS_PATH.test(text)) {
      findings.push(finding('error', 'portable-path', 'committed cordis.yml contains a machine-absolute plugin path; keep a relative name and let `dshx overlay` generate the absolute --patch file', {
        path: `${plugin.dir}/cordis.yml`,
        hint: "name: './src/<file>.ts' in git; dshx start/verify rewrite it to an absolute path at runtime",
      }))
    } else {
      findings.push(finding('ok', 'portable-path', 'committed overlay does not hardcode a machine path'))
    }
  }

  if (!existsSync(plugin.entryAbs)) {
    findings.push(finding('error', 'entry', `entry missing: ${plugin.entryAbs}`))
  }

  findings.push(...clientEntryFindings(plugin.dir))

  return findings
}

function readCommittedOverlayText(dir: string): string {
  const path = join(dir, 'cordis.yml')
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}
