import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dumpConfig, dumpDefaultConfig, duplicateIds, parseDumpEntries } from './dsh.ts'
import { envHas, finding, loadDotEnv, loadJson, loadYaml } from './io.ts'
import { currentHost, portOpen } from './host.ts'
import { staleFileCopyFindings } from './file-copy.ts'
import { profileDir, resolveDshHome, sessionsRoot } from './paths.ts'
import { listSessions } from './sessions.ts'
import { TEMPLATE_BUNDLES, type Finding, type ProfileName } from './types.ts'

interface ProfileManifest {
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
}

function nodeMeetsEngine(version: string): boolean {
  const m = /^v(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!m) return false
  const major = Number(m[1])
  const minor = Number(m[2])
  return major >= 24 || (major === 22 && minor >= 19)
}

export async function runDoctor(root: string, profile: ProfileName): Promise<Finding[]> {
  const findings: Finding[] = []
  const node = process.version
  if (nodeMeetsEngine(node)) {
    findings.push(finding('ok', 'node', `Node ${node} satisfies ^22.19 || >=24`))
  } else {
    findings.push(finding('error', 'node', `Node ${node} does not satisfy ^22.19.0 || >=24.0.0`))
  }

  if (existsSync(join(root, 'apps/cli/src/bin.ts'))) {
    findings.push(finding('ok', 'repo', 'DeepSeek Harness source launcher present'))
  } else {
    findings.push(finding('error', 'repo', 'apps/cli/src/bin.ts missing'))
  }

  const envFile = loadDotEnv(join(root, '.env'))
  const keys = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'DEEPSEEK_API_KEY']
  for (const key of keys) {
    const present = envHas(key, envFile)
    findings.push(finding(present ? 'ok' : 'info', `env-${key.toLowerCase()}`, present ? `${key} is set (value hidden)` : `${key} is not set`))
  }

  const home = resolveDshHome()
  findings.push(finding(existsSync(home) ? 'ok' : 'warn', 'dsh-home', existsSync(home) ? `DSH home exists` : `DSH home missing`, { path: home }))
  const prof = profileDir(home, profile)
  if (!existsSync(prof)) {
    findings.push(finding('warn', 'profile', `profile ${profile} not initialized yet`, { path: prof }))
  } else {
    findings.push(finding('ok', 'profile', `profile ${profile} present`, { path: prof }))
    const manifestPath = join(prof, 'package.json')
    if (existsSync(manifestPath)) {
      const manifest = loadJson<ProfileManifest>(manifestPath)
      const bundles = manifest.dsh?.profile?.bundles ?? []
      const deps = new Set(Object.keys(manifest.dependencies ?? {}))
      const template = new Set(TEMPLATE_BUNDLES[profile])
      let leftover = 0
      for (const bundle of bundles) {
        if (!template.has(bundle) && !deps.has(bundle)) {
          leftover += 1
          findings.push(finding('error', 'leftover-bundle', `dsh.profile.bundles lists ${bundle} but it is not a template bundle and not a dependency — this is the #917 brick`, {
            path: manifestPath,
            hint: 'hand-delete that bundles row; dsh plugin install/ls will not remove it',
          }))
        }
      }
      if (leftover === 0) {
        findings.push(finding('ok', 'leftover-bundle', 'no leftover dsh.profile.bundles rows'))
      }
      const stale = staleFileCopyFindings(profile)
      if (stale.length === 0) {
        findings.push(finding('ok', 'stale-file-copy', 'no file: plugins in this profile'))
      } else {
        findings.push(...stale)
      }
      const patchPath = join(prof, 'cordis.patch.yml')
      if (existsSync(patchPath)) {
        const patch = loadYaml(readFileSync(patchPath, 'utf8'))
        const insertIds = collectInsertIds(patch)
        for (const id of insertIds) {
          findings.push(finding('info', 'profile-insert', `profile patch inserts id ${id}`, { path: patchPath }))
        }
      }
    }
  }

  const dumped = dumpConfig(root, profile)
  if (dumped.code !== 0) {
    findings.push(finding('error', 'dump-config', `dump-config exited ${dumped.code}`, { hint: dumped.stderr.trim().slice(0, 400) }))
  } else {
    const entries = parseDumpEntries(dumped.stdout)
    const dups = duplicateIds(entries)
    findings.push(finding('ok', 'dump-config', `dump-config exited 0 with ${entries.length} rows — this is NOT a boot proof`))
    if (dups.length > 0) {
      findings.push(finding('error', 'duplicate-id', `composed tree repeats loader id: ${dups.join(', ')}`, {
        hint: 'real boot will throw duplicate loader entry id. remove the extra insert from cordis.patch.yml',
      }))
    } else {
      findings.push(finding('ok', 'duplicate-id', 'composed tree has no repeated loader id'))
    }
    const defaults = dumpDefaultConfig(root, profile)
    if (defaults.code === 0) {
      const defaultIds = new Set(parseDumpEntries(defaults.stdout).map(entry => entry.id))
      const extra = entries.filter(entry => !defaultIds.has(entry.id)).map(entry => entry.id)
      if (extra.length > 0) {
        findings.push(finding('info', 'dump-delta', `ids present in dump-config but not dump-default-config: ${extra.slice(0, 12).join(', ')}`))
      }
    }
  }

  const host = currentHost(root)
  if (host) {
    findings.push(finding('ok', 'host-supervised', `dshx supervises pid ${host.pid} profile ${host.profile} port ${host.port}`))
  } else {
    findings.push(finding('info', 'host-supervised', 'dshx is not supervising a host (use dshx start from outside Creator Mode)'))
  }
  if (await portOpen(3080)) {
    findings.push(host?.port === 3080
      ? finding('ok', 'port-3080', 'supervised host is the listener on 127.0.0.1:3080')
      : finding('warn', 'port-3080', '127.0.0.1:3080 accepts HTTP but dshx is not supervising it — do not treat this as your plugin host'))
  }

  const sessions = listSessions(sessionsRoot(home))
  const orphans = sessions.filter(item => item.orphanCallIds.length > 0)
  const open = sessions.filter(item => item.openTurn)
  findings.push(finding('info', 'sessions', `${sessions.length} session log(s) under $DSH_HOME/sessions`))
  if (orphans.length > 0) {
    findings.push(finding('warn', 'orphan-tool-call', `${orphans.length} session(s) have unpaired tool/call — same-session continue will 400`, {
      hint: 'official fix is a new session or headless. do not retry the scarred session',
    }))
  } else if (sessions.length > 0) {
    findings.push(finding('ok', 'orphan-tool-call', 'no unpaired tool/call in local session logs'))
  }
  if (open.length > 0) {
    findings.push(finding('info', 'open-turn', `${open.length} session(s) look mid-turn; official load synthesizes interrupted only for still-OPEN tails`))
  }

  findings.push(finding('info', 'not-official-doctor', 'dshx doctor is a workshop command, not official `dsh doctor` (that command does not exist)'))
  return findings
}

function collectInsertIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids: string[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const insert = (item as { insert?: unknown }).insert
    if (!Array.isArray(insert)) continue
    for (const row of insert) {
      if (row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string') {
        ids.push((row as { id: string }).id)
      }
    }
  }
  return ids
}
