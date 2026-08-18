import { finding, printReport, report } from '../internal/io.ts'
import { dshxPackageRoot, knowledgeDir, pluginsDir, resolveDshHome, resolveHarness, skillPackageDir, stateDir, userHarnessConfigPath } from '../internal/paths.ts'
import { describeSkillInstall } from '../internal/skills.ts'
import { DSHX_VERSION, type CliOptions } from '../internal/types.ts'

export function cmdWhich(_args: string[], options: CliOptions, root: string): number {
  const resolved = resolveHarness({ start: process.cwd(), requireDshx: true })
  const findings = [
    finding('ok', 'dshx', `dshx ${DSHX_VERSION}`),
    finding('ok', 'root-source', `harness resolved via ${resolved.source ?? 'unknown'}`),
    ...describeSkillInstall(root),
  ]
  const result = report('which', findings, {
    repo: root,
    source: resolved.source,
    dshx: dshxPackageRoot(),
    skill: skillPackageDir(),
    knowledge: knowledgeDir(),
    plugins: pluginsDir(root),
    state: stateDir(root),
    dshHome: resolveDshHome(),
    harnessConfig: userHarnessConfigPath(),
    node: process.version,
  })
  printReport(result, options.json)
  return result.ok ? 0 : 1
}
