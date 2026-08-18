import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { loadYaml } from './io.ts'
import { knowledgeDir } from './paths.ts'

export interface OkfDoc {
  id: string
  path: string
  rel: string
  reserved: boolean
  type?: string
  title?: string
  description?: string
  tags: string[]
  aliases: string[]
  status?: string
  body: string
  links: string[]
}

export interface SearchHit {
  doc: OkfDoc
  score: number
  matched: string[]
}

export interface CatalogEntry {
  id: string
  type?: string
  title?: string
  description?: string
  tags: string[]
  aliases: string[]
  status?: string
}

export interface RetrievalFixture {
  query: string
  mustInclude: string
  first?: string
}

const RESERVED = new Set(['index.md', 'log.md'])

const FIELD_WEIGHT: Record<string, number> = {
  aliases: 50,
  id: 40,
  title: 30,
  tags: 25,
  description: 16,
  type: 10,
  body: 4,
}

/**
 * Bidirectional synonym groups. A query token matches if any member of its
 * group appears in a concept field. Keep groups tight: they exist so agents
 * can find a shredded concept without guessing the filename.
 */
const SYNONYM_GROUPS: string[][] = [
  ['retry', 'retries', 'retried', 'maxretries', 'retrypolicy', 'dsh-llm-retry', 'llm-retry', '重试', '自动重试'],
  ['timeout', 'timeouts', 'idle', 'streamidletimeout', 'streamidletimeoutms', 'llm_stream_idle_timeout', '超时', '断流'],
  ['llmerror', 'llm-error', 'harnesserror', 'failure.code', '报错'],
  ['orphan', 'scar', '伤疤', 'pairing', 'tool_call', 'tool_calls', 'tool-call'],
  ['400', 'invalid_request', 'invalid-request'],
  ['session', 'chat', '会话', '新对话', '新会话'],
  ['creator', '创造模式', 'creator mode', 'cordis_define', 'cordis_run'],
  ['dump', 'dump-config', 'dumpconfig', '假阴性'],
  ['verify', 'boot', 'marker', '真启动'],
  ['kill', 'suicide', '自杀', 'taskkill', 'host-suicide'],
  ['recopy', 'already up to date', 'stale-file-copy', 'file-copy-stale'],
  ['adapter', 'llm-adapter', 'registeradapter', 'provider'],
  ['config', 'schema', 'schemastery', 'plugin-config'],
  ['supervising', 'supervises', 'already supervising', 'already supervises'],
  ['headless', 'one-shot', 'oneshot', 'headless-boot', 'no-ui', 'noui', 'no ui'],
]

export const RETRIEVAL_FIXTURES: RetrievalFixture[] = [
  { query: 'retry', mustInclude: 'contracts/llm-retry', first: 'contracts/llm-retry' },
  { query: 'timeout', mustInclude: 'contracts/llm-timeout', first: 'contracts/llm-timeout' },
  { query: 'maxRetries', mustInclude: 'contracts/llm-retry' },
  { query: 'retryPolicy', mustInclude: 'contracts/llm-retry' },
  { query: 'dsh-llm-retry', mustInclude: 'contracts/llm-retry' },
  { query: 'portable', mustInclude: 'contracts/patch-overlay' },
  { query: 'plugin', mustInclude: 'contracts/plugin-forms', first: 'contracts/plugin-forms' },
  { query: 'stream idle', mustInclude: 'contracts/llm-timeout' },
  { query: 'LlmError', mustInclude: 'contracts/llm-error' },
  { query: 'orphan tool_call', mustInclude: 'pitfalls/orphan-tool-call' },
  { query: '400', mustInclude: 'pitfalls/orphan-tool-call' },
  { query: 'dump-config', mustInclude: 'contracts/dump-config' },
  { query: 'Creator Mode', mustInclude: 'contracts/creator-mode' },
  { query: 'session scar', mustInclude: 'pitfalls/orphan-tool-call' },
  { query: '重试', mustInclude: 'contracts/llm-retry' },
  { query: '超时', mustInclude: 'contracts/llm-timeout' },
  { query: 'registerAdapter', mustInclude: 'contracts/llm-adapter' },
  { query: 'turn/end error', mustInclude: 'contracts/turn-error' },
  { query: 'headless', mustInclude: 'playbooks/headless-boot', first: 'playbooks/headless-boot' },
  { query: 'no-ui', mustInclude: 'playbooks/headless-boot', first: 'playbooks/headless-boot' },
  { query: '--profile headless', mustInclude: 'playbooks/headless-boot', first: 'playbooks/headless-boot' },
  { query: 'default export', mustInclude: 'contracts/plugin-forms', first: 'contracts/plugin-forms' },
  { query: 'export default', mustInclude: 'contracts/plugin-forms', first: 'contracts/plugin-forms' },
  { query: 'check', mustInclude: 'playbooks/check-plugin', first: 'playbooks/check-plugin' },
  { query: 'check fail', mustInclude: 'playbooks/check-plugin', first: 'playbooks/check-plugin' },
  { query: 'already supervising', mustInclude: 'playbooks/restart-outside' },
  { query: 'stop', mustInclude: 'playbooks/restart-outside', first: 'playbooks/restart-outside' },
  { query: 'doctor', mustInclude: 'computations/doctor-profile', first: 'computations/doctor-profile' },
  { query: '3091', mustInclude: 'references/dshx-cli' },
  { query: '--keep', mustInclude: 'playbooks/verify-boot', first: 'playbooks/verify-boot' },
  { query: 'overwrite', mustInclude: 'playbooks/init-plugin' },
  { query: '--force', mustInclude: 'playbooks/init-plugin' },
  { query: '--force', mustInclude: 'references/dshx-cli', first: 'references/dshx-cli' },
  { query: 'busy port', mustInclude: 'references/dshx-cli' },
  { query: 'port-3080', mustInclude: 'references/dshx-cli' },
  { query: 'host-supervised', mustInclude: 'references/dshx-cli' },
  { query: 'Already up to date', mustInclude: 'pitfalls/file-copy-stale', first: 'pitfalls/file-copy-stale' },
  { query: 'file: recopy', mustInclude: 'pitfalls/file-copy-stale' },
  { query: 'dshx ship', mustInclude: 'playbooks/ship-plugin', first: 'playbooks/ship-plugin' },
  { query: 'DSHX_HARNESS', mustInclude: 'playbooks/setup-workshop' },
  { query: 'one-liner', mustInclude: 'playbooks/setup-workshop', first: 'playbooks/setup-workshop' },
]

function walkMd(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) walkMd(path, acc)
    else if (name.endsWith('.md')) acc.push(path)
  }
  return acc
}

function splitFrontmatter(text: string): { data: Record<string, unknown>; body: string } | undefined {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return undefined
  const end = text.indexOf('\n---', 4)
  if (end < 0) return undefined
  const raw = text.slice(4, end)
  const body = text.slice(end + 4).replace(/^\r?\n/, '')
  const data = loadYaml(raw)
  if (!data || typeof data !== 'object') return { data: {}, body }
  return { data: data as Record<string, unknown>, body }
}

function markdownLinks(body: string): string[] {
  const out: string[] = []
  const re = /\[[^\]]*]\(([^)]+)\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(body))) {
    const href = match[1]!.split(/\s+/)[0]!.replace(/["']/g, '')
    if (href && !href.startsWith('http') && !href.startsWith('mailto:')) out.push(href)
  }
  return out
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
}

function fold(value: string): string {
  return value.toLowerCase().replace(/[_/.-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Fold, then treat remaining punctuation (backticks, CJK commas) as spaces. */
function tokenizeHay(value: string): string {
  return fold(value).replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

function compact(value: string): string {
  return fold(value).replace(/\s+/g, '')
}

function expandToken(token: string): string[] {
  const folded = fold(token)
  const squeezed = compact(token)
  const out = new Set<string>([folded, squeezed, token.toLowerCase()])
  for (const group of SYNONYM_GROUPS) {
    const hit = group.some(member => fold(member) === folded || compact(member) === squeezed)
    if (!hit) continue
    for (const member of group) {
      out.add(fold(member))
      out.add(compact(member))
    }
  }
  return [...out].filter(Boolean)
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function wordHit(hay: string, token: string): boolean {
  const folded = tokenizeHay(hay)
  const t = tokenizeHay(token)
  if (!t) return false
  if (t.length <= 6) return new RegExp(`(?:^|\\s)${escapeRe(t)}(?:$|\\s)`).test(` ${folded} `)
  return folded.includes(t) || compact(hay).includes(compact(token))
}

function aliasHit(aliases: string[], variants: string[]): boolean {
  return aliases.some(alias => {
    const folded = fold(alias)
    const squeezed = compact(alias)
    return variants.some(v => {
      if (!v) return false
      if (folded === v || squeezed === compact(v)) return true
      return v.length >= 8 && (folded.includes(v) || squeezed.includes(compact(v)))
    })
  })
}

function fieldHits(field: string, hay: string, variants: string[], aliases: string[]): boolean {
  if (field === 'aliases') return aliasHit(aliases, variants)
  return variants.some(v => wordHit(hay, v))
}

export function loadBundle(root?: string): { dir: string; docs: OkfDoc[] } {
  const dir = knowledgeDir(root)
  if (!existsSync(dir)) throw new Error(`OKF bundle missing: ${dir}`)
  const docs = walkMd(dir).sort().map(path => {
    const rel = relative(dir, path).split(sep).join('/')
    const text = readFileSync(path, 'utf8')
    const reserved = RESERVED.has(path.split(sep).pop() ?? '')
    if (reserved) {
      return {
        id: rel.replace(/\.md$/, ''),
        path,
        rel,
        reserved: true,
        tags: [],
        aliases: [],
        body: text.replace(/^---[\s\S]*?---\r?\n/, ''),
        links: markdownLinks(text),
      }
    }
    let parsed: { data: Record<string, unknown>; body: string } | undefined
    try {
      parsed = splitFrontmatter(text)
    } catch (error) {
      throw new Error(`${rel}: ${error instanceof Error ? error.message : error}`)
    }
    const data = parsed?.data ?? {}
    return {
      id: rel.replace(/\.md$/, ''),
      path,
      rel,
      reserved: false,
      type: typeof data.type === 'string' ? data.type : undefined,
      title: typeof data.title === 'string' ? data.title : undefined,
      description: typeof data.description === 'string' ? data.description : undefined,
      tags: stringList(data.tags),
      aliases: stringList(data.aliases),
      status: typeof data.status === 'string' ? data.status : undefined,
      body: parsed?.body ?? text,
      links: markdownLinks(parsed?.body ?? text),
    }
  })
  return { dir, docs }
}

export function catalogBundle(root?: string): CatalogEntry[] {
  return loadBundle(root).docs
    .filter(doc => !doc.reserved)
    .map(doc => ({
      id: doc.id,
      type: doc.type,
      title: doc.title,
      description: doc.description,
      tags: doc.tags,
      aliases: doc.aliases,
      status: doc.status,
    }))
}

export function scoreDoc(doc: OkfDoc, query: string): SearchHit | undefined {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return undefined

  const fields: Record<string, string> = {
    aliases: doc.aliases.join('\n'),
    id: doc.id,
    title: doc.title ?? '',
    tags: doc.tags.join('\n'),
    description: doc.description ?? '',
    type: doc.type ?? '',
    body: doc.reserved ? '' : doc.body,
  }

  let score = 0
  const matched = new Set<string>()
  let missed = false
  for (const token of tokens) {
    const variants = expandToken(token)
    let best = 0
    let bestField: string | undefined
    for (const [field, hay] of Object.entries(fields)) {
      if (!fieldHits(field, hay, variants, doc.aliases)) continue
      const weight = FIELD_WEIGHT[field] ?? 0
      if (weight > best) {
        best = weight
        bestField = field
      }
    }
    if (!bestField) {
      missed = true
      continue
    }
    score += best
    matched.add(bestField)
  }

  const phrase = fold(query)
  let phraseAlias = false
  if (phrase.length > 2) {
    phraseAlias = aliasHit(doc.aliases, [phrase])
    if (phraseAlias) {
      score += 20
      matched.add('aliases')
    }
    if (wordHit(doc.title ?? '', phrase)) score += 12
    if (wordHit(doc.id, phrase)) score += 12
  }

  // Multi-word aliases are identity. "check fail" must hit alias "check fail"
  // even when the token "fail" is not a standalone field.
  if (missed && !phraseAlias) return undefined
  if (score === 0) return undefined

  return { doc, score, matched: [...matched] }
}

export function searchBundle(query: string, root?: string): SearchHit[] {
  const { docs } = loadBundle(root)
  return docs
    .filter(doc => !doc.reserved)
    .map(doc => scoreDoc(doc, query))
    .filter((hit): hit is SearchHit => hit !== undefined)
    .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))
}

export function runRetrievalFixtures(root?: string): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  for (const fixture of RETRIEVAL_FIXTURES) {
    const hits = searchBundle(fixture.query, root)
    const ids = hits.map(hit => hit.doc.id)
    if (!ids.includes(fixture.mustInclude)) {
      errors.push(`search ${JSON.stringify(fixture.query)} missed ${fixture.mustInclude} (hits: ${ids.slice(0, 8).join(', ') || 'none'})`)
    }
    if (fixture.first && ids[0] !== fixture.first) {
      errors.push(`search ${JSON.stringify(fixture.query)} first hit was ${ids[0] ?? 'none'}, expected ${fixture.first}`)
    }
  }
  return { ok: errors.length === 0, errors }
}

export function lintBundle(root?: string): { ok: boolean; errors: string[]; warnings: string[] } {
  const { dir, docs } = loadBundle(root)
  const errors: string[] = []
  const warnings: string[] = []
  const ids = new Set(docs.map(doc => `/${doc.rel}`))
  for (const doc of docs) {
    if (doc.reserved) {
      if (doc.rel === 'index.md' && !/okf_version/.test(readFileSync(doc.path, 'utf8'))) {
        warnings.push('root index.md should declare okf_version: "0.2"')
      }
      continue
    }
    if (!doc.type) errors.push(`${doc.rel}: missing required frontmatter type`)
    if (!doc.description) warnings.push(`${doc.rel}: missing description (index/search snippets use it)`)
    if (doc.aliases.length === 0) warnings.push(`${doc.rel}: missing aliases (agents search symptoms, not filenames)`)
  }
  for (const doc of docs) {
    for (const href of doc.links) {
      const resolved = href.startsWith('/')
        ? href.slice(1)
        : join(dirname(doc.rel), href).split(sep).join('/')
      const file = resolved.replace(/\/$/, '/index.md')
      const candidates = [file, `${file}.md`, file.endsWith('.md') ? file : `${file}.md`]
      if (!candidates.some(c => existsSync(join(dir, c)) || ids.has(`/${c}`))) {
        warnings.push(`${doc.rel}: link not in bundle: ${href}`)
      }
    }
  }
  const retrieval = runRetrievalFixtures(root)
  errors.push(...retrieval.errors)
  return { ok: errors.length === 0, errors, warnings }
}

export function readDoc(rel: string, root?: string): OkfDoc | undefined {
  const { docs } = loadBundle(root)
  const normalized = rel.replace(/^\//, '').replace(/\.md$/, '')
  return docs.find(doc =>
    doc.id === normalized
    || doc.rel === rel
    || doc.rel === `${normalized}.md`
    || doc.id === `${normalized}/index`
    || doc.rel === `${normalized}/index.md`,
  )
}

export function listDir(rel = '', root?: string): { files: string[]; dirs: string[] } {
  const { dir } = loadBundle(root)
  const target = join(dir, rel)
  if (!existsSync(target) || !statSync(target).isDirectory()) {
    throw new Error(`not a directory in the bundle: ${rel || '/'}`)
  }
  const files: string[] = []
  const dirs: string[] = []
  for (const name of readdirSync(target).sort()) {
    const path = join(target, name)
    if (statSync(path).isDirectory()) dirs.push(name)
    else if (name.endsWith('.md')) files.push(name)
  }
  return { files, dirs }
}
