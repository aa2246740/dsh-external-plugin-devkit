import { readFileSync } from 'node:fs'
import { finding, printReport, report } from '../internal/io.ts'
import { digestBundle, logObserve, sha256File } from '../internal/observe.ts'
import { catalogBundle, listDir, lintBundle, loadBundle, readDoc, searchBundle } from '../internal/okf.ts'
import { knowledgeDir } from '../internal/paths.ts'
import type { CliOptions } from '../internal/types.ts'

const SEARCH_NEXT = 'Search snippets are not the contract. Cat the first hit before acting.'

export function cmdKb(args: string[], options: CliOptions, root: string): number {
  const sub = args[0]
  if (sub === 'digest') {
    const digest = digestBundle()
    logObserve(root, { kind: 'kb', op: 'digest', files: Object.keys(digest.files).length })
    if (options.json) {
      process.stdout.write(`${JSON.stringify(digest, null, 2)}\n`)
      return 0
    }
    process.stdout.write(`okf digest ${digest.generatedAt} files=${Object.keys(digest.files).length}\n`)
    for (const [file, hash] of Object.entries(digest.files)) {
      process.stdout.write(`${hash}  ${file}\n`)
    }
    return 0
  }
  if (!sub || sub === 'path' || sub === 'root') {
    const { dir, docs } = loadBundle()
    const concepts = docs.filter(doc => !doc.reserved)
    logObserve(root, { kind: 'kb', op: 'entry', path: dir, concepts: concepts.length })
    const result = report('kb', [
      finding('ok', 'bundle', 'OKF v0.2 knowledge bundle is available — explore it yourself'),
      finding('info', 'entry', 'read index.md → start-here.md → maps/symptoms.md, then follow links'),
      finding('info', 'walk', 'after kb search, you MUST kb cat the hit; snippets are not the contract'),
    ], {
      path: dir,
      concepts: concepts.length,
      how: [
        'dshx kb ls',
        'dshx kb catalog',
        'dshx kb cat start-here',
        'dshx kb cat maps/symptoms',
        'dshx kb search retry',
        'dshx kb cat contracts/llm-retry',
        'dshx kb lint',
      ].join('\n'),
    })
    printReport(result, options.json)
    if (!options.json) {
      process.stdout.write(`\n${readFileSync(`${dir}/index.md`, 'utf8')}\n`)
    }
    return 0
  }
  if (sub === 'ls') {
    const rel = args[1] ?? ''
    const listing = listDir(rel)
    logObserve(root, { kind: 'kb', op: 'ls', rel, dirs: listing.dirs, files: listing.files })
    const result = report('kb ls', [
      finding('ok', 'list', rel || '/'),
    ], { dirs: listing.dirs, files: listing.files })
    printReport(result, options.json)
    return 0
  }
  if (sub === 'catalog') {
    const entries = catalogBundle()
    logObserve(root, { kind: 'kb', op: 'catalog', concepts: entries.length })
    const result = report('kb catalog', [
      finding('ok', 'catalog', `${entries.length} concepts (frontmatter only — cat a hit to read the body)`),
    ], {
      next: 'dshx kb cat <id>',
      results: entries.map(entry => ({
        id: entry.id,
        type: entry.type,
        title: entry.title,
        description: entry.description,
        tags: entry.tags,
        aliases: entry.aliases,
      })),
    })
    printReport(result, options.json)
    return 0
  }
  if (sub === 'cat') {
    const target = args[1]
    if (!target) {
      printReport(report('kb cat', [finding('error', 'usage', 'dshx kb cat <concept>')]), options.json)
      return 1
    }
    const doc = readDoc(target)
    if (!doc) {
      logObserve(root, { kind: 'kb', op: 'cat-miss', target })
      printReport(report('kb cat', [
        finding('error', 'missing', `concept not found: ${target}`),
        finding('info', 'hint', 'dshx kb search <words>   or   dshx kb catalog   or   dshx kb ls <dir>'),
        finding('info', 'dirs', 'directory names resolve to <dir>/index.md (example: dshx kb cat community)'),
      ]), options.json)
      return 1
    }
    logObserve(root, {
      kind: 'kb',
      op: 'cat',
      target,
      id: doc.id,
      type: doc.type,
      sha256: sha256File(doc.path),
    })
    if (options.json) {
      printReport(report('kb cat', [finding('ok', 'doc', doc.rel)], {
        type: doc.type,
        title: doc.title,
        description: doc.description,
        aliases: doc.aliases,
        tags: doc.tags,
        body: doc.body,
      }), true)
      return 0
    }
    process.stdout.write(`# ${doc.title ?? doc.id}\n`)
    if (doc.type) process.stdout.write(`type: ${doc.type}\n`)
    if (doc.description) process.stdout.write(`${doc.description}\n`)
    if (doc.aliases.length) process.stdout.write(`aliases: ${doc.aliases.join(', ')}\n`)
    process.stdout.write(`file: ${doc.rel}\n\n`)
    process.stdout.write(readFileSync(doc.path, 'utf8'))
    if (!readFileSync(doc.path, 'utf8').endsWith('\n')) process.stdout.write('\n')
    return 0
  }
  if (sub === 'search') {
    const query = args.slice(1).join(' ')
    if (!query) {
      printReport(report('kb search', [finding('error', 'usage', 'dshx kb search <words>')]), options.json)
      return 1
    }
    const hits = searchBundle(query)
    const surfaced = hits.filter(hit => hit.score >= 16)
    const shown = (surfaced.length ? surfaced : hits).slice(0, 8)
    logObserve(root, {
      kind: 'kb',
      op: 'search',
      query,
      hits: hits.map(hit => hit.doc.id),
      surfaced: shown.map(hit => hit.doc.id),
      scores: shown.map(hit => ({ id: hit.doc.id, score: hit.score, matched: hit.matched })),
    })
    const top = shown[0] ?? hits[0]
    const findings = [
      finding(hits.length ? 'ok' : 'warn', 'hits', `${hits.length} concept(s) match ${JSON.stringify(query)}; showing ${shown.length} frontmatter-ranked`),
    ]
    if (top) {
      findings.push(finding('info', 'next', `dshx kb cat ${top.doc.id}`))
      findings.push(finding('info', 'rule', SEARCH_NEXT))
    } else {
      findings.push(finding('info', 'next', 'dshx kb cat maps/symptoms'))
      findings.push(finding('info', 'also', 'dshx kb catalog'))
    }
    const result = report('kb search', findings, {
      next: top ? `dshx kb cat ${top.doc.id}` : 'dshx kb cat maps/symptoms',
      results: shown.map(hit => ({
        id: hit.doc.id,
        type: hit.doc.type,
        title: hit.doc.title,
        description: hit.doc.description,
        score: hit.score,
        matched: hit.matched,
        aliases: hit.doc.aliases,
      })),
    })
    printReport(result, options.json)
    return hits.length ? 0 : 1
  }
  if (sub === 'lint') {
    const lint = lintBundle()
    logObserve(root, { kind: 'kb', op: 'lint', ok: lint.ok, errors: lint.errors.length, warnings: lint.warnings.length })
    const findings = [
      ...lint.errors.map(message => finding('error', 'okf', message)),
      ...lint.warnings.map(message => finding('warn', 'okf', message)),
    ]
    if (findings.length === 0) findings.push(finding('ok', 'okf', 'bundle conforms to OKF v0.2 required rules'))
    const result = report('kb lint', findings, { path: knowledgeDir() })
    printReport(result, options.json)
    return result.ok ? 0 : 1
  }
  printReport(report('kb', [finding('error', 'usage', 'dshx kb [ls|catalog|cat|search|lint|digest|path]')]), options.json)
  return 1
}
