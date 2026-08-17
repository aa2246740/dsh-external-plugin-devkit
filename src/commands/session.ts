import { finding, printReport, report } from '../internal/io.ts'
import { resolveDshHome, sessionsRoot } from '../internal/paths.ts'
import { listSessions } from '../internal/sessions.ts'
import type { CliOptions } from '../internal/types.ts'

export function cmdSession(args: string[], options: CliOptions): number {
  const sub = args[0] ?? 'list'
  const sessions = listSessions(sessionsRoot(resolveDshHome()))
  if (sub === 'list') {
    const findings = sessions.length === 0
      ? [finding('info', 'none', 'no session logs under $DSH_HOME/sessions')]
      : sessions.slice(0, 30).map(item => {
        if (item.orphanCallIds.length > 0) {
          return finding('warn', 'orphan', `${item.id} unpaired tool/call ${item.orphanCallIds.join(',')}`, { path: item.path })
        }
        if (item.openTurn) {
          return finding('info', 'open', `${item.id} looks mid-turn`, { path: item.path })
        }
        return finding('ok', 'session', `${item.id} calls=${item.calls} results=${item.results} preset=${item.agentPreset ?? '-'}`, { path: item.path })
      })
    const orphans = sessions.filter(item => item.orphanCallIds.length > 0)
    findings.push(finding('info', 'policy', orphans.length
      ? 'CLOSED error pairing cannot be healed in-session. open a new session or use headless.'
      : 'no orphan tool_call in these logs. if one appears later: new session or headless, do not Continue'))
    printReport(report('session list', findings, { count: sessions.length }), options.json)
    return 0
  }
  if (sub === 'inspect') {
    const id = args[1]
    const hit = id
      ? sessions.find(item => item.id === id || item.path.includes(id))
      : sessions[0]
    if (!hit) {
      printReport(report('session inspect', [finding('error', 'missing', id ? `session not found: ${id}` : 'no sessions')]), options.json)
      return 1
    }
    const findings = [
      finding(hit.orphanCallIds.length ? 'warn' : 'ok', 'pairing', hit.orphanCallIds.length
        ? `orphan tool_call ids: ${hit.orphanCallIds.join(', ')}`
        : 'no unpaired tool/call in this log'),
      finding(hit.openTurn ? 'info' : 'ok', 'turn', hit.openTurn ? 'log ends mid-turn' : 'no open turn'),
      finding('info', 'policy', hit.orphanCallIds.length
        ? 'do not continue this session. official recovery is a new session / headless'
        : 'pairing looks closed'),
    ]
    printReport(report('session inspect', findings, hit), options.json)
    return 0
  }
  printReport(report('session', [finding('error', 'usage', 'dshx session list|inspect [id]')]), options.json)
  return 1
}
