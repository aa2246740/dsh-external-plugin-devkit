/**
 * Target-aware browser bundle preset for out-of-tree dshx plugins.
 *
 * DeepSeek Harness' own `clientBundle()` intentionally resolves manifests from
 * two-level package directories under `packages/`. A plugin under
 * `my-plugins/` therefore needs this adapter:
 * it reads the package being built from its own directory while preserving the
 * official lazy-CJS registration, shared module identities, CSS ownership, and
 * client HMR cleanup markers.
 */

import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isBuiltin } from 'node:module'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { transform } from 'lightningcss'
import { assertClientCordisInject } from './internal/client-cordis-inject.js'

function clientPlatformPath() {
  const requested = process.env.DSHX_HARNESS?.trim()
  const fallback = resolve(dirname(fileURLToPath(import.meta.url)), '../../../packages/client/web/src/platform.ts')
  const path = requested ? resolve(requested, 'packages/client/web/src/platform.ts') : fallback
  if (!existsSync(path)) {
    throw new Error(`dshx client build: target Harness client platform table not found at ${path}`)
  }
  return path
}

const {
  PLATFORM_MODULES,
  PRELOADED_CLIENT_EXTERNALS,
} = await import(pathToFileURL(clientPlatformPath()).href)

const CSS_MODULE_PREFIX = '\0dshx-css-module:'
const CSS_GLOBAL_PREFIX = '\0dshx-css-global:'
const CSS_INLINE_PREFIX = '\0dshx-css-inline:'
const VIRTUAL_SUFFIX = '.mjs'
const INLINE_QUERY = '?inline'

const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|file-reference|session|llm|tools|brand|util-workspace-path)(\/|$)/
const VENDORED_LIBRARY = /^@deepseek-ai\/(cosmokit|schemastery)(\/|$)/
const GENERATED_REMOTE = /^@deepseek-ai\/dsh-[a-z0-9]+(?:-[a-z0-9]+)*\/remote$/

function packageManifest(packageRoot) {
  const path = resolve(packageRoot, 'package.json')
  if (!existsSync(path)) throw new Error(`dshx client build: package.json not found at ${path}`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

function clientDeclaration(id, manifest) {
  if (manifest.name !== id) {
    throw new Error(`dshx client build: config id ${JSON.stringify(id)} does not match package name ${JSON.stringify(manifest.name)}`)
  }
  const declaration = manifest.dsh?.client
  if (declaration === undefined || typeof declaration !== 'object' || declaration === null) {
    throw new Error(`dshx client build: ${id} must declare dsh.client`)
  }
  if (declaration.platform !== 'web') {
    throw new Error(`dshx client build: ${id} dsh.client.platform must be "web"`)
  }
  if (declaration.external !== undefined && (
    !Array.isArray(declaration.external)
    || declaration.external.some(value => typeof value !== 'string' || value.length === 0)
  )) {
    throw new Error(`dshx client build: ${id} dsh.client.external must be an array of non-empty strings`)
  }
  const external = declaration.external ?? []
  const duplicate = external.find((value, index) => external.indexOf(value) !== index)
  if (duplicate !== undefined) {
    throw new Error(`dshx client build: ${id} dsh.client.external contains duplicate ${JSON.stringify(duplicate)}`)
  }
  const baseline = new Set([...PLATFORM_MODULES, ...PRELOADED_CLIENT_EXTERNALS])
  const repeatedBaseline = external.find(value => baseline.has(value))
  if (repeatedBaseline !== undefined) {
    throw new Error(`dshx client build: ${id} dsh.client.external repeats implicit baseline module ${JSON.stringify(repeatedBaseline)}`)
  }
  if (external.includes(id) || external.includes(`${id}/client`)) {
    throw new Error(`dshx client build: ${id} dsh.client.external must not request its own package row`)
  }
  return declaration
}

function clientDefines(environment) {
  const mode = environment.NODE_ENV ?? 'production'
  const values = {
    'process.env': '{}',
    'process.env.NODE_ENV': JSON.stringify(mode),
    'import.meta.env.MODE': JSON.stringify(mode),
    'import.meta.env': JSON.stringify({ MODE: mode }),
  }
  for (const [name, value] of Object.entries(environment)) {
    if (!name.startsWith('DSH_CLIENT_') || value === undefined) continue
    values[`process.env.${name}`] = JSON.stringify(value)
  }
  return values
}

function escapeSpecifier(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function packagePatterns(manifest) {
  const names = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ])
  return [...names].sort().map(name => new RegExp(`^${escapeSpecifier(name)}(/|$)`))
}

function matches(patterns, specifier) {
  return patterns.some(pattern => pattern.test(specifier))
}

function styleModule(id, path, css, classMap) {
  const tagId = `${id}/${basename(path)}`
  const source = [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
    "  const tag = document.createElement('style');",
    `  tag.dataset.plugin = ${JSON.stringify(id)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
  ]
  source.push(classMap === undefined ? 'export {};' : `export default ${JSON.stringify(classMap)};`)
  return source.join('\n')
}

function assetPath(source, importer) {
  return importer === undefined ? source : resolve(dirname(importer), source)
}

function cssPlugins(id, requested) {
  return [{
    name: 'dshx-client-bundle-purity',
    resolveId(source) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (requested.has(source)) return null
      if (VENDORED_LIBRARY.test(source) || INLINE_SAFE.test(source) || GENERATED_REMOTE.test(source)) return null
      throw new Error(
        `dshx client bundle purity: ${JSON.stringify(source)} is not a shared baseline or dsh.client.external request; `
        + 'use a Cordis service/slot, a type-only import, or declare the exact dynamic module request',
      )
    },
  }, {
    name: 'dshx-css-modules',
    resolveId(source, importer) {
      if (!source.endsWith('.module.css')) return null
      return CSS_MODULE_PREFIX + assetPath(source, importer) + VIRTUAL_SUFFIX
    },
    async load(virtualId) {
      if (!virtualId.startsWith(CSS_MODULE_PREFIX)) return null
      const path = virtualId.slice(CSS_MODULE_PREFIX.length, -VIRTUAL_SUFFIX.length)
      this.addWatchFile(path)
      const source = await readFile(path)
      const { code, exports: cssExports } = transform({
        filename: path,
        code: source,
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classMap = {}
      for (const [local, value] of Object.entries(cssExports ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
        classMap[local] = value.name
      }
      return styleModule(id, path, code.toString(), classMap)
    },
  }, {
    name: 'dshx-css-inline',
    resolveId(source, importer) {
      if (!source.endsWith(`.css${INLINE_QUERY}`)) return null
      const stylesheet = source.slice(0, -INLINE_QUERY.length)
      return CSS_INLINE_PREFIX + assetPath(stylesheet, importer) + VIRTUAL_SUFFIX
    },
    async load(virtualId) {
      if (!virtualId.startsWith(CSS_INLINE_PREFIX)) return null
      const path = virtualId.slice(CSS_INLINE_PREFIX.length, -VIRTUAL_SUFFIX.length)
      this.addWatchFile(path)
      const source = await readFile(path)
      const { code } = transform({ filename: path, code: source, minify: true })
      return `export default ${JSON.stringify(code.toString())};`
    },
  }, {
    name: 'dshx-css-global',
    resolveId(source, importer) {
      if (!source.endsWith('.css') || source.endsWith('.module.css')) return null
      return CSS_GLOBAL_PREFIX + assetPath(source, importer) + VIRTUAL_SUFFIX
    },
    async load(virtualId) {
      if (!virtualId.startsWith(CSS_GLOBAL_PREFIX)) return null
      const path = virtualId.slice(CSS_GLOBAL_PREFIX.length, -VIRTUAL_SUFFIX.length)
      this.addWatchFile(path)
      const source = await readFile(path)
      const { code } = transform({ filename: path, code: source, minify: true })
      return styleModule(id, path, code.toString())
    },
  }]
}

/**
 * Build a Host half plus a target-Harness lazy-CJS browser half for one out-of-tree package.
 *
 * @param {string} id package name and browser graph id.
 * @param {readonly string[]} libEntry tsc-emitted Host entries under lib/types.
 * @param {{ packageRoot?: string, clientEntry?: string }} options build paths.
 * @returns {object[]} tsdown configuration array.
 */
export function externalClientBundle(id, libEntry, options = {}) {
  const packageRoot = resolve(options.packageRoot ?? process.cwd())
  const manifest = packageManifest(packageRoot)
  const declaration = clientDeclaration(id, manifest)
  const clientEntry = options.clientEntry ?? 'src/client/index.ts'
  assertClientCordisInject(packageRoot, clientEntry)
  const requested = new Set([
    ...PLATFORM_MODULES,
    ...PRELOADED_CLIENT_EXTERNALS,
    ...(declaration.external ?? []),
  ])
  const production = packagePatterns(manifest)
  const plugins = cssPlugins(id, requested)

  return [{
    name: id,
    entry: [...libEntry],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    deps: {
      neverBundle: specifier => matches(production, specifier),
      alwaysBundle: specifier => !isBuiltin(specifier) && !matches(production, specifier),
    },
  }, {
    name: `${id}/client`,
    entry: { client: clientEntry },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: specifier => requested.has(specifier),
      alwaysBundle: specifier => !requested.has(specifier),
    },
    define: clientDefines(process.env),
    plugins,
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  }]
}
