import { finding, printReport, report } from '../internal/io.ts'
import { writeOverlay } from '../internal/overlay.ts'
import { loadPlugin } from '../internal/plugin.ts'
import type { CliOptions } from '../internal/types.ts'

export function cmdOverlay(args: string[], options: CliOptions, root: string): number {
  try {
    const plugin = loadPlugin(root, args[0])
    const path = writeOverlay(root, plugin)
    const result = report('overlay', [
      finding('ok', 'overlay', 'wrote machine-local absolute --patch file (do not commit)'),
    ], { path, id: plugin.id, entry: plugin.entryAbs })
    printReport(result, options.json)
    return 0
  } catch (error) {
    printReport(report('overlay', [finding('error', 'overlay', error instanceof Error ? error.message : String(error))]), options.json)
    return 1
  }
}
