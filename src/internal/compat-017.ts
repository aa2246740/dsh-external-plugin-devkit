import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { finding } from './io.ts'
import type { Finding, PluginManifest } from './types.ts'

const SKIP_DIRS = new Set(['node_modules', 'lib', 'dist', 'out', '.dshx', '.git', '.build'])
const SOURCE = /\.(?:[cm]?[jt]sx?)$/
const DECLARATION = /\.d\.(?:[cm]?ts)$/

interface CompatRule {
  code: string
  message: string
  hint: string
  match: (text: string) => boolean
}

const RULES: readonly CompatRule[] = [
  {
    code: 'compat-017-session-start',
    message: 'the agent/session-start event was renamed in 0.1.7-rc.1',
    hint: 'listen to agent/created instead; a listener on the old name mounts cleanly but never fires',
    match: text => /['"]agent\/session-start['"]/.test(text),
  },
  {
    code: 'compat-017-agent-presets',
    message: '@deepseek-ai/dsh-agent-presets was removed in 0.1.7-rc.1',
    hint: 'register presets through ctx.agentPresets or a bundle preset patch; the standalone package is gone',
    match: text => /@deepseek-ai\/dsh-agent-presets\b/.test(text),
  },
  {
    code: 'compat-017-job-owner',
    message: 'job.ownerSession is gone in 0.1.7-rc.1',
    hint: 'read job.owner (a SessionId); jobs list/kill/wait now take caller?: SessionId',
    match: text => /\.ownerSession\b/.test(text),
  },
  {
    code: 'compat-017-client-runtime',
    message: '@deepseek-ai/dsh-client-runtime was removed before 0.1.7-rc.1',
    hint: 'import Context from @deepseek-ai/cordis; the slots augmentation ships in dsh-client-ui-renderer/client',
    match: text => /@deepseek-ai\/dsh-client-runtime\b/.test(text),
  },
]

function walkSources(dir: string): string[] {
  const out: string[] = []
  const walk = (current: string): void => {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (SKIP_DIRS.has(entry.name)) continue
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      if (SOURCE.test(entry.name) && !DECLARATION.test(entry.name)) out.push(path)
    }
  }
  walk(dir)
  return out
}

export function compat017Findings(plugin: PluginManifest, repoRoot: string): Finding[] {
  if (!existsSync(plugin.dir)) return []
  const findings: Finding[] = []
  const seen = new Set<string>()
  for (const path of walkSources(plugin.dir)) {
    const text = readFileSync(path, 'utf8')
    const rel = relative(repoRoot, path)
    for (const rule of RULES) {
      const key = `${rule.code}:${rel}`
      if (seen.has(key) || !rule.match(text)) continue
      seen.add(key)
      findings.push(finding('error', rule.code, rule.message, { path: rel, hint: rule.hint }))
    }
  }
  return findings
}
