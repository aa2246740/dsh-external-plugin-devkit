import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { profileDir } from './paths.ts'
import type { PluginManifest, ProfileName } from './types.ts'

export interface RuntimePackageLink {
  name: string
  link: string
  target: string
  entry: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function serverEntry(plugin: PluginManifest): string {
  const runtimePackage = plugin.runtimePackage
  if (!runtimePackage) throw new Error(`plugin has no runtime package: ${plugin.id}`)
  const parsed: unknown = JSON.parse(readFileSync(runtimePackage.manifestPath, 'utf8'))
  if (!isRecord(parsed)) throw new Error(`package manifest must hold an object: ${runtimePackage.manifestPath}`)
  const exports = isRecord(parsed.exports) ? parsed.exports : undefined
  const rootExport = exports?.['.']
  const entry = typeof rootExport === 'string'
    ? rootExport
    : isRecord(rootExport) && typeof rootExport.import === 'string'
      ? rootExport.import
      : isRecord(rootExport) && typeof rootExport.default === 'string'
        ? rootExport.default
        : typeof parsed.main === 'string'
          ? parsed.main
          : undefined
  if (!entry) throw new Error(`web client package has no executable root export: ${runtimePackage.manifestPath}`)
  const absolute = resolve(dirname(runtimePackage.manifestPath), entry)
  if (!existsSync(absolute)) throw new Error(`web client package root export is missing: ${absolute}`)
  return realpathSync(absolute)
}

/**
 * Link a local browser plugin into the selected profile's native package-resolution seam.
 * Server-only source plugins keep their absolute TypeScript overlay and require no link.
 */
export function ensureRuntimePackageLink(
  plugin: PluginManifest,
  home: string,
  profile: ProfileName,
): RuntimePackageLink | undefined {
  const runtimePackage = plugin.runtimePackage
  if (runtimePackage?.webClient !== true) return undefined
  const target = realpathSync(plugin.dir)
  const dir = profileDir(home, profile)
  const link = join(dir, 'node_modules', runtimePackage.name)
  mkdirSync(dirname(link), { recursive: true })
  if (existsSync(link)) {
    const existing = realpathSync(link)
    if (existing !== target) {
      throw new Error(`profile package ${runtimePackage.name} already resolves to ${existing}; refusing to replace it with ${target}`)
    }
  } else {
    try {
      const stat = lstatSync(link)
      throw new Error(`profile package link is dangling or unreadable: ${link} (${stat.isSymbolicLink() ? 'symlink' : 'path'})`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    symlinkSync(target, link, 'dir')
  }
  return { name: runtimePackage.name, link, target, entry: serverEntry(plugin) }
}
