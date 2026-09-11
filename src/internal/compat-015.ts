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
    code: 'compat-015-message-text',
    message: 'MessageText is gone from @deepseek-ai/dsh-client-ui-primitives',
    hint: 'render markdown with MarkdownText; read contracts/compat-0.1.5',
    match: text => /\bMessageText\b/.test(text),
  },
  {
    code: 'compat-015-add-images',
    message: 'InputActions.addImages is gone',
    hint: 'createDrafts(sessionId, files) then InputActions.addAttachments(ids); read contracts/compat-0.1.5',
    match: text => /\.addImages\s*\(/.test(text),
  },
  {
    code: 'compat-015-create-draft-images',
    message: 'createDraftImages is gone',
    hint: 'use Conversation.createDrafts(sessionId, files); image MIME stays an image draft, everything else becomes a file draft; read contracts/compat-0.1.5',
    match: text => /\bcreateDraftImages\b/.test(text),
  },
  {
    code: 'compat-015-pending-images',
    message: 'PendingSubmission.images is gone',
    hint: 'read PendingSubmission.attachments; image items are { type: "image", value }; read contracts/compat-0.1.5',
    match: text => /\bPendingSubmission\b/.test(text) && /(?<![A-Za-z])\.images\b/.test(text),
  },
  {
    code: 'compat-015-command-images',
    message: 'CommandInputDescriptor.images is gone',
    hint: 'declare CommandInputDescriptor.attachments?: boolean; read contracts/compat-0.1.5',
    match: text => /\bCommandInputDescriptor\b/.test(text) && /\bimages\s*\?:/.test(text),
  },
  {
    code: 'compat-015-epoch-system',
    message: 'EpochHeader.system is gone',
    hint: 'system prompt is derived history: the latest system/message event, not a header field; read contracts/compat-0.1.5',
    match: text => /\bEpochHeader\b/.test(text) && /\.system\b/.test(text),
  },
  {
    code: 'compat-015-assistant-chunk',
    message: 'live assistant/chunk events are gone',
    hint: 'durable assistant text lives on assistant/attempt.stream; do not subscribe to assistant/chunk; read contracts/compat-0.1.5',
    match: text => /['"]assistant\/chunk['"]/.test(text),
  },
  {
    code: 'compat-015-ctx-agent',
    message: 'ctx.agent is gone',
    hint: 'inject and read ctx.agents; keep ctx.agentLoop / ctx.agentPresets / ctx.agentDefaultModel; read contracts/compat-0.1.5',
    match: text => /ctx\.agent(?![A-Za-z])/.test(text) || /inject\s*=\s*\[[^\]]*['"]agent['"]/.test(text),
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

export function compat015Findings(plugin: PluginManifest, repoRoot: string): Finding[] {
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
