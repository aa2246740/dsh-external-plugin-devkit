import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { finding } from './io.ts'
import { dshxPackageRoot, skillPackageDir } from './paths.ts'
import type { Finding } from './types.ts'

export interface SkillTarget {
  id: string
  dest: string
  kind: 'skill-dir' | 'cursor-rule'
}

export function discoverSkillTargets(harnessRoot: string): SkillTarget[] {
  const targets: SkillTarget[] = []
  const homes: Array<{ id: string; home: string | undefined }> = [
    { id: 'codex', home: firstExisting([process.env.CODEX_HOME, join(homedir(), '.codex')]) },
    { id: 'claude', home: firstExisting([join(homedir(), '.claude')]) },
    { id: 'grok', home: firstExisting([process.env.GROK_HOME, join(homedir(), '.grok')]) },
  ]
  for (const item of homes) {
    if (!item.home) continue
    targets.push({ id: item.id, dest: join(item.home, 'skills', 'dshx'), kind: 'skill-dir' })
  }
  if (existsSync(join(harnessRoot, '.agents'))) {
    targets.push({ id: 'agents', dest: join(harnessRoot, '.agents', 'skills', 'dshx'), kind: 'skill-dir' })
  }
  targets.push({
    id: 'cursor',
    dest: join(harnessRoot, '.cursor', 'rules', 'dshx.mdc'),
    kind: 'cursor-rule',
  })
  return targets
}

export function cursorRuleSource(): string {
  return join(dshxPackageRootFromSkill(), '.cursor', 'rules', 'dshx.mdc')
}

export function describeSkillInstall(harnessRoot: string): Finding[] {
  const source = skillPackageDir()
  const findings: Finding[] = []
  if (!existsSync(join(source, 'SKILL.md'))) {
    findings.push(finding('error', 'skill-source', 'bundled skill/dshx/SKILL.md is missing', { path: source }))
    return findings
  }
  findings.push(finding('ok', 'skill-source', 'bundled generic skill is present', { path: source }))
  for (const target of discoverSkillTargets(harnessRoot)) {
    const from = target.kind === 'cursor-rule' ? cursorRuleSource() : source
    findings.push(skillStatusFinding(from, target))
  }
  return findings
}

export function installSkills(harnessRoot: string, dryRun: boolean): Finding[] {
  const source = skillPackageDir()
  const cursorRule = cursorRuleSource()
  const findings: Finding[] = []
  if (!existsSync(join(source, 'SKILL.md'))) {
    findings.push(finding('error', 'skill-source', 'bundled skill/dshx/SKILL.md is missing', { path: source }))
    return findings
  }
  for (const target of discoverSkillTargets(harnessRoot)) {
    const from = target.kind === 'cursor-rule' ? cursorRule : source
    if (!existsSync(from)) {
      findings.push(finding('error', `skill-${target.id}`, `source missing for ${target.id}`, { path: from }))
      continue
    }
    if (dryRun) {
      findings.push(finding('info', `skill-${target.id}`, `would link ${target.dest} → ${from}`))
      continue
    }
    try {
      linkReplace(from, target.dest)
      findings.push(finding('ok', `skill-${target.id}`, `linked ${target.id}`, { path: target.dest }))
    } catch (error) {
      findings.push(finding('error', `skill-${target.id}`, error instanceof Error ? error.message : String(error), { path: target.dest }))
    }
  }
  return findings
}

function skillStatusFinding(source: string, target: SkillTarget): Finding {
  if (!existsSync(target.dest) && !isSymlink(target.dest)) {
    return finding('info', `skill-${target.id}`, `${target.id} not installed`, { path: target.dest })
  }
  if (isSymlink(target.dest)) {
    const dest = readlinkSync(target.dest)
    const resolved = resolveMaybe(target.dest, dest)
    const ok = resolved === source || dest === source
    return finding(ok ? 'ok' : 'warn', `skill-${target.id}`, ok
      ? `${target.id} links to the bundled skill`
      : `${target.id} links elsewhere (${dest})`, { path: target.dest })
  }
  return finding('warn', `skill-${target.id}`, `${target.id} exists but is not a symlink to the bundled skill`, { path: target.dest })
}

function dshxPackageRootFromSkill(): string {
  return dshxPackageRoot()
}

function firstExisting(paths: Array<string | undefined>): string | undefined {
  for (const path of paths) {
    if (path && existsSync(path)) return path
  }
  return undefined
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

function resolveMaybe(linkPath: string, dest: string): string {
  return dest.startsWith('/') ? dest : join(dirname(linkPath), dest)
}

function linkReplace(from: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true })
  if (isSymlink(dest)) {
    unlinkSync(dest)
  } else if (existsSync(dest)) {
    const stat = lstatSync(dest)
    if (stat.isDirectory()) {
      const marker = join(dest, 'SKILL.md')
      const text = existsSync(marker) ? readFileSync(marker, 'utf8') : ''
      if (!text.includes('dshx')) {
        throw new Error(`cannot replace ${dest}; it is not a dshx skill directory`)
      }
      rmSync(dest, { recursive: true, force: true })
    } else {
      unlinkSync(dest)
    }
  }
  symlinkSync(from, dest)
}
