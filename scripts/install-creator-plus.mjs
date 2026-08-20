import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_PACKAGE = 'dsh-external-plugin-devkit/creator-plus'

function isHarnessRoot(path) {
  return existsSync(join(path, 'apps/cli/src/bin.ts'))
    && existsSync(join(path, 'apps/cli/config/agent-presets/standard/agent.cordis.yml'))
    && existsSync(join(path, 'tools/dshx/src/cli.ts'))
}

function walkForHarness(start) {
  let cursor = resolve(start)
  while (true) {
    if (isHarnessRoot(cursor)) return cursor
    const parent = dirname(cursor)
    if (parent === cursor) return undefined
    cursor = parent
  }
}

function replaceOnce(text, search, replacement, label) {
  const first = text.indexOf(search)
  if (first < 0 || text.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Creator Mode+ installer expected exactly one ${label} block in the Standard preset`)
  }
  return text.slice(0, first) + replacement + text.slice(first + search.length)
}

function tightenTree(path) {
  const info = statSync(path)
  if (info.isDirectory()) {
    chmodSync(path, 0o700)
    for (const name of readdirSync(path)) tightenTree(join(path, name))
    return
  }
  chmodSync(path, info.mode & 0o111 ? 0o700 : 0o600)
}

function creatorComposition(standard) {
  let text = replaceOnce(
    standard,
    '# The `standard` agent preset: the full coding agent, mounted once per process.',
    '# Creator Mode+ starts from the shipped Standard preset and adds fixed portable-JS dshx tools.',
    'preset heading',
  )
  text = replaceOnce(
    text,
    `    text: >-\n      You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.`,
    `    text: |-\n      You are Creator Mode+, a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.\n\n      Create file-backed DeepSeek Harness plugins with dshx. Treat the official browser WebUI and public Cordis/client extension points as the compatibility target. App-shell APIs and wrapper-specific behavior are outside the supported surface.\n\n      Load the \`creator-mode-plus\` skill before creating, activating, hot-reloading, or validating a DSH plugin. Keep Harness core and shipped presets unchanged.`,
    'persona',
  )
  text = replaceOnce(
    text,
    `- id: skill-filesystem\n  name: '@deepseek-ai/dsh-skill-filesystem'`,
    `- id: skill-filesystem\n  name: '@deepseek-ai/dsh-skill-filesystem'\n  config:\n    customSkillDirs:\n      - !!js "process.getBuiltinModule('node:url').fileURLToPath(new URL('skills/', baseUrl))"`,
    'skill filesystem',
  )
  return replaceOnce(
    text,
    `- id: tool-skill\n  name: '@deepseek-ai/dsh-tool-skill'`,
    `- id: tool-skill\n  name: '@deepseek-ai/dsh-tool-skill'\n\n# Fixed dshx operations only; no shell, arbitrary argv, or process control.\n- id: dshx-creator-plus\n  name: ${DEFAULT_PACKAGE}`,
    'tool skill',
  )
}

function upgradeManagedAssets(target, root) {
  const composition = join(target, 'agent.cordis.yml')
  const text = existsSync(composition) ? readFileSync(composition, 'utf8') : ''
  const managedRow = `- id: dshx-creator-plus\n  name: ${DEFAULT_PACKAGE}`
  if (!text.includes(managedRow)) {
    throw new Error(`Creator Mode+ at ${target} does not contain the managed dshx row; refusing an unsafe upgrade`)
  }

  const temporaryRoot = mkdtempSync(join(root, '.creator-plus-upgrade-'))
  const stagedSkill = join(temporaryRoot, 'creator-mode-plus')
  const stagedPreset = join(temporaryRoot, 'preset.yml')
  const backupSkill = join(temporaryRoot, 'previous-skill')
  const backupPreset = join(temporaryRoot, 'previous-preset.yml')
  const targetSkill = join(target, 'skills/creator-mode-plus')
  const targetPreset = join(target, 'preset.yml')
  let skillBackedUp = false
  let presetBackedUp = false
  try {
    cpSync(join(packageRoot, 'creator-plus/skills/creator-mode-plus'), stagedSkill, { recursive: true, errorOnExist: true })
    cpSync(join(packageRoot, 'creator-plus/preset.yml'), stagedPreset, { errorOnExist: true })
    tightenTree(stagedSkill)
    tightenTree(stagedPreset)
    if (existsSync(targetSkill)) {
      renameSync(targetSkill, backupSkill)
      skillBackedUp = true
    }
    if (existsSync(targetPreset)) {
      renameSync(targetPreset, backupPreset)
      presetBackedUp = true
    }
    renameSync(stagedSkill, targetSkill)
    renameSync(stagedPreset, targetPreset)
  } catch (error) {
    rmSync(targetSkill, { recursive: true, force: true })
    rmSync(targetPreset, { force: true })
    if (skillBackedUp && existsSync(backupSkill)) renameSync(backupSkill, targetSkill)
    if (presetBackedUp && existsSync(backupPreset)) renameSync(backupPreset, targetPreset)
    throw error
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
  return target
}

export function installCreatorPlus(options = {}) {
  const harnessRoot = resolve(
    options.harnessRoot
      || process.env.DSHX_HARNESS
      || walkForHarness(process.cwd())
      || '',
  )
  if (!isHarnessRoot(harnessRoot)) {
    throw new Error('no DeepSeek Harness checkout found; set DSHX_HARNESS or run inside the checkout')
  }
  const dshHome = resolve(options.dshHome || process.env.DSH_HOME || join(homedir(), '.dsh'))
  const root = join(dshHome, '.agent-presets')
  const target = join(root, 'creator-plus')
  if (existsSync(target)) {
    if (options.upgrade === true) return upgradeManagedAssets(target, root)
    throw new Error(`Creator Mode+ already exists at ${target}; refusing to overwrite a user preset (pass --upgrade to replace only managed skill/metadata assets)`)
  }

  const source = join(harnessRoot, 'apps/cli/config/agent-presets/standard')
  mkdirSync(root, { recursive: true })
  const temporaryRoot = mkdtempSync(join(root, '.creator-plus-install-'))
  const staging = join(temporaryRoot, 'creator-plus')
  try {
    cpSync(source, staging, { recursive: true, errorOnExist: true })
    const composition = join(staging, 'agent.cordis.yml')
    const standard = readFileSync(composition, 'utf8')
    writeFileSync(composition, creatorComposition(standard))
    cpSync(join(packageRoot, 'creator-plus/preset.yml'), join(staging, 'preset.yml'), { force: true })
    cpSync(join(packageRoot, 'creator-plus/skills'), join(staging, 'skills'), { recursive: true, force: true })
    tightenTree(staging)
    renameSync(staging, target)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
  return target
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const upgrade = process.argv.includes('--upgrade')
    const target = installCreatorPlus({ upgrade })
    process.stdout.write(`Creator Mode+ ${upgrade ? 'updated' : 'installed'} at ${target}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 2
  }
}
