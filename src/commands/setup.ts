import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { finding, loadJson, printReport, report, writeText, readText } from '../internal/io.ts'
import { resolveHarness, userHarnessConfigPath, writeHarnessConfig } from '../internal/paths.ts'
import { DSHX_CLONE_URL, DAILY_PROMPT_EN, DAILY_PROMPT_ZH, HARNESS_SCRIPTS, SETUP_PROMPT_EN, SETUP_PROMPT_ZH } from '../internal/setup-prompt.ts'
import { installSkills } from '../internal/skills.ts'
import type { CliOptions, Finding } from '../internal/types.ts'

interface RootPackage {
  scripts?: Record<string, string>
}

export function cmdSetup(args: string[], options: CliOptions): number {
  if (options.printPrompt || args[0] === '--print-prompt') {
    printReport(report('setup', [
      finding('ok', 'prompt', 'paste the first block into any external agent that does not know dshx yet'),
    ], {
      zh: SETUP_PROMPT_ZH,
      en: SETUP_PROMPT_EN,
      dailyZh: DAILY_PROMPT_ZH,
      dailyEn: DAILY_PROMPT_EN,
    }), options.json)
    return 0
  }

  const resolved = resolveHarness({
    start: process.cwd(),
    flag: options.harness ?? args[0],
    requireDshx: false,
  })
  if (!resolved.ok || !resolved.root) {
    printReport(report('setup', [finding('error', 'harness', resolved.message ?? 'cannot find Harness')]), options.json)
    return 1
  }

  const root = resolved.root
  const findings: Finding[] = [
    finding('ok', 'harness', `using ${resolved.source} checkout`, { path: root }),
  ]

  if (options.dryRun) {
    findings.push(finding('info', 'dry-run', 'no files will be written'))
  }

  const clone = ensureDshxTree(root, options.dryRun)
  findings.push(...clone)

  findings.push(...ensureRootScripts(root, options.dryRun))
  findings.push(...installSkills(root, options.dryRun))

  if (options.dryRun) {
    findings.push(finding('info', 'config', `would write ${userHarnessConfigPath()} → ${root}`))
  } else {
    const path = writeHarnessConfig(root)
    findings.push(finding('ok', 'config', 'remembered this checkout for later wrong-cwd runs', { path }))
  }

  findings.push(finding('info', 'not-host', 'setup does not start or stop dsh. classify future activation with contracts/live-activation'))
  findings.push(finding('info', 'next', 'dshx which && dshx doctor && dshx kb cat contracts/live-activation'))

  const result = report('setup', findings, { repo: root, source: resolved.source })
  printReport(result, options.json)
  return result.ok ? 0 : 1
}

function ensureDshxTree(root: string, dryRun: boolean): Finding[] {
  const dest = join(root, 'tools/dshx')
  const cli = join(dest, 'src/cli.ts')
  if (existsSync(cli)) {
    return [finding('ok', 'dshx-tree', 'tools/dshx is already present; not pulling', { path: dest })]
  }
  if (dryRun) {
    return [finding('info', 'dshx-tree', `would git clone ${DSHX_CLONE_URL} into ${dest}`)]
  }
  const parent = join(root, 'tools')
  const cloned = spawnSync('git', ['clone', '--depth', '1', DSHX_CLONE_URL, dest], {
    encoding: 'utf8',
    cwd: parent,
  })
  if ((cloned.status ?? 1) !== 0) {
    return [finding('error', 'dshx-tree', `git clone failed: ${(cloned.stderr || cloned.stdout).trim() || 'unknown error'}`, {
      path: dest,
      hint: `git clone ${DSHX_CLONE_URL} ${dest}`,
    })]
  }
  return [finding('ok', 'dshx-tree', 'cloned dsh-external-plugin-devkit into tools/dshx', { path: dest })]
}

function ensureRootScripts(root: string, dryRun: boolean): Finding[] {
  const pkgPath = join(root, 'package.json')
  if (!existsSync(pkgPath)) {
    return [finding('error', 'scripts', 'Harness package.json missing', { path: pkgPath })]
  }
  const pkg = loadJson<RootPackage>(pkgPath)
  const scripts = { ...pkg.scripts }
  const missing = Object.entries(HARNESS_SCRIPTS).filter(([key, value]) => scripts[key] !== value)
  if (missing.length === 0) {
    return [finding('ok', 'scripts', 'root package.json already has dshx scripts')]
  }
  if (dryRun) {
    return [finding('info', 'scripts', `would add scripts: ${missing.map(([key]) => key).join(', ')}`)]
  }
  for (const [key, value] of missing) scripts[key] = value
  const original = readText(pkgPath)
  const parsed = JSON.parse(original) as RootPackage & Record<string, unknown>
  parsed.scripts = scripts
  writeText(pkgPath, `${JSON.stringify(parsed, null, 2)}\n`)
  return [finding('ok', 'scripts', `added root scripts: ${missing.map(([key]) => key).join(', ')}`)]
}
