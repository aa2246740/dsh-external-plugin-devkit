import { chmodSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { finding, printReport, readText, report, writeText } from '../internal/io.ts'
import { resolveHarness, skillPackageDir, userHarnessConfigPath, writeHarnessConfig } from '../internal/paths.ts'
import { DSHX_CLONE_URL, DAILY_PROMPT_EN, DAILY_PROMPT_ZH, SETUP_PROMPT_EN, SETUP_PROMPT_ZH } from '../internal/setup-prompt.ts'
import { installSkills } from '../internal/skills.ts'
import type { CliOptions, Finding } from '../internal/types.ts'

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

  findings.push(...ensureUserLauncher(options.dryRun))
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

export function userLauncherPath(): string {
  return join(homedir(), '.local', 'bin', 'dshx')
}

function ensureUserLauncher(dryRun: boolean): Finding[] {
  const source = join(skillPackageDir(), 'scripts', 'dshx.sh')
  const dest = userLauncherPath()
  if (!existsSync(source)) {
    return [finding('error', 'launcher', 'bundled dshx launcher is missing', { path: source })]
  }
  if (dryRun) {
    return [finding('info', 'launcher', `would install user launcher ${dest}; Harness package.json remains unchanged`)]
  }
  writeText(dest, readText(source))
  chmodSync(dest, 0o755)
  return [finding('ok', 'launcher', 'installed user launcher without editing Harness core', { path: dest })]
}
