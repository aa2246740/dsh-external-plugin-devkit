import { runDoctor } from '../internal/doctor.ts'
import { printReport, report } from '../internal/io.ts'
import type { CliOptions } from '../internal/types.ts'

export async function cmdDoctor(_args: string[], options: CliOptions, root: string): Promise<number> {
  const findings = await runDoctor(root, options.profile)
  const result = report('doctor', findings)
  printReport(result, options.json)
  return result.ok ? 0 : 1
}
