import { finding, printReport, report } from '../internal/io.ts'
import { dshxPackageRoot, knowledgeDir, pluginsDir, resolveDshHome, stateDir } from '../internal/paths.ts'
import { DSHX_VERSION, type CliOptions } from '../internal/types.ts'

export function cmdWhich(_args: string[], options: CliOptions, root: string): number {
  const result = report('which', [
    finding('ok', 'dshx', `dshx ${DSHX_VERSION}`),
  ], {
    repo: root,
    dshx: dshxPackageRoot(),
    knowledge: knowledgeDir(),
    plugins: pluginsDir(root),
    state: stateDir(root),
    dshHome: resolveDshHome(),
    node: process.version,
  })
  printReport(result, options.json)
  return 0
}
