import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { finding, printReport, report } from '../internal/io.ts'
import { listRubrics, loadRubric, scoreExperiment } from '../internal/experiment.ts'
import { logObserve, readExperiment, type ExperimentState } from '../internal/observe.ts'
import { experimentStatePath, stateDir } from '../internal/paths.ts'
import type { CliOptions } from '../internal/types.ts'

function writeState(root: string, state: ExperimentState): void {
  mkdirSync(stateDir(root), { recursive: true })
  writeFileSync(experimentStatePath(root), `${JSON.stringify(state, null, 2)}\n`)
}

export function cmdExperiment(args: string[], options: CliOptions, root: string): number {
  const sub = args[0]
  if (sub === 'list') {
    const rubrics = listRubrics()
    printReport(report('experiment list', [finding('ok', 'rubrics', rubrics.join(', ') || '(none)')], { rubrics }), options.json)
    return 0
  }
  if (sub === 'status') {
    const current = readExperiment(root)
    if (!current) {
      printReport(report('experiment status', [finding('info', 'idle', 'no active experiment')]), options.json)
      return 0
    }
    printReport(report('experiment status', [finding('ok', 'active', current.id)], current), options.json)
    return 0
  }
  if (sub === 'begin') {
    const id = args[1]
    if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      printReport(report('experiment begin', [finding('error', 'usage', 'dshx experiment begin <id> [--rubric <name>]')]), options.json)
      return 1
    }
    const rubricFlag = args.indexOf('--rubric')
    const rubricId = rubricFlag >= 0 ? args[rubricFlag + 1] : undefined
    if (rubricId) {
      try {
        loadRubric(rubricId)
      } catch (error) {
        printReport(report('experiment begin', [finding('error', 'rubric', error instanceof Error ? error.message : String(error))]), options.json)
        return 1
      }
    }
    const state: ExperimentState = { id, rubric: rubricId, startedAt: new Date().toISOString() }
    writeState(root, state)
    logObserve(root, { kind: 'experiment', op: 'begin', id, rubric: rubricId })
    printReport(report('experiment begin', [finding('ok', 'begin', id)], state), options.json)
    return 0
  }
  if (sub === 'end') {
    const current = readExperiment(root)
    const path = experimentStatePath(root)
    if (existsSync(path)) unlinkSync(path)
    if (current) logObserve(root, { kind: 'experiment', op: 'end', id: current.id })
    printReport(report('experiment end', [finding('ok', 'end', current?.id ?? 'idle')]), options.json)
    return 0
  }
  if (sub === 'score') {
    const current = readExperiment(root)
    const id = args[1] ?? current?.id
    if (!id) {
      printReport(report('experiment score', [finding('error', 'usage', 'dshx experiment score <id>')]), options.json)
      return 1
    }
    let rubricId = current?.id === id ? current.rubric : undefined
    if (args.includes('--rubric')) rubricId = args[args.indexOf('--rubric') + 1]
    if (!rubricId) {
      printReport(report('experiment score', [finding('error', 'rubric', 'pass --rubric <name> (dshx experiment list)')]), options.json)
      return 1
    }
    let rubric
    try {
      rubric = loadRubric(rubricId)
    } catch (error) {
      printReport(report('experiment score', [finding('error', 'rubric', error instanceof Error ? error.message : String(error))]), options.json)
      return 1
    }
    const score = scoreExperiment(root, id, rubric)
    const findings = score.checks.map(check => finding(check.ok ? 'ok' : 'error', check.code, check.message))
    if (findings.length === 0) findings.push(finding('error', 'empty', 'no observe events for this experiment id'))
    printReport(report('experiment score', findings, {
      experiment: score.experiment,
      rubric: score.rubric,
      passed: `${score.passed}/${score.total}`,
      cats: score.cats,
      searches: score.searches,
      commands: score.commands,
    }), options.json)
    return score.ok ? 0 : 1
  }
  printReport(report('experiment', [finding('error', 'usage', 'dshx experiment begin|end|status|score|list')]), options.json)
  return 1
}
