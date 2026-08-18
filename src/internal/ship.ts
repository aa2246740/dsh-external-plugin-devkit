import { existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { loadJson } from './io.ts'
import { pluginsDir } from './paths.ts'
import { resolveFileSpec } from './file-copy.ts'

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
    throw new Error('dshx ship <package-dir|package-name|file-path>')
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
      const source = resolveFileSpec(spec, profileDir)
      if (source && existsSync(source)) return namedPackage(source)
    }
  }
  throw new Error(`cannot resolve ship target ${raw} (need a directory with package.json, a my-plugins name, or a file: profile dependency)`)
}

function namedPackage(source: string): ShipTarget {
  const pkg = loadJson<PackageJson>(resolve(source, 'package.json'))
  const name = pkg.name ?? basename(source)
  if (!name) throw new Error(`package at ${source} has no name`)
  return { name, source }
}
