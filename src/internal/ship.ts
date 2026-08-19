import { existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { loadJson } from './io.ts'
import { pluginsDir } from './paths.ts'
import { resolveLocalSpec } from './file-copy.ts'

interface PackageJson {
  name?: string
  dependencies?: Record<string, string>
}

export interface ShipTarget {
  name: string
  source: string
}

export function resolveShipTarget(root: string, profileDir: string, raw?: string): ShipTarget {
  if (!raw) {
    throw new Error('dshx sync-artifact <package-dir|package-name|file-path>')
  }
  const asPath = resolve(raw)
  if (existsSync(asPath) && existsSync(resolve(asPath, 'package.json'))) {
    return namedPackage(asPath)
  }
  const underPlugins = resolve(pluginsDir(root), raw)
  if (existsSync(underPlugins) && existsSync(resolve(underPlugins, 'package.json'))) {
    return namedPackage(underPlugins)
  }
  const manifestPath = resolve(profileDir, 'package.json')
  if (existsSync(manifestPath)) {
    const manifest = loadJson<PackageJson>(manifestPath)
    const spec = manifest.dependencies?.[raw]
    if (spec) {
      const source = resolveLocalSpec(spec, profileDir)
      if (source && existsSync(source)) return namedPackage(source)
    }
  }
  throw new Error(`cannot resolve ship target ${raw} (need a directory with package.json, a my-plugins name, or a file:/link: profile dependency)`)
}

export function preserveBundleOrder(before: readonly string[], after: readonly string[]): string[] {
  const present = new Set(after)
  const ordered = before.filter(name => present.has(name))
  const known = new Set(ordered)
  for (const name of after) {
    if (!known.has(name)) ordered.push(name)
  }
  return ordered
}

function namedPackage(source: string): ShipTarget {
  const pkg = loadJson<PackageJson>(resolve(source, 'package.json'))
  const name = pkg.name ?? basename(source)
  if (!name) throw new Error(`package at ${source} has no name`)
  return { name, source }
}
