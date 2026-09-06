import { existsSync, lstatSync, realpathSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'

const HMR_MODULE = '@deepseek-ai/cordis-plugin-hmr'
const ACTIVE = 2
const DISPOSED = 4
const HMR_ENTRY_ID = /^dshx-hot-reload-hmr-[0-9a-f]{32}$/
const CONFIG_KEYS = new Set(['hmrEntryId', 'targetFiles'])

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function within(path, parent) {
  return path === parent || path.startsWith(`${parent}${sep}`)
}

function overlaps(first, second) {
  return within(first, second) || within(second, first)
}

function canonicalFile(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 4_096 || !isAbsolute(path)
    || !existsSync(path) || lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) {
    throw new Error('hot-reload HMR audit targetFiles must contain absolute real artifact files')
  }
  const canonical = realpathSync(path)
  if (canonical !== resolve(path)) {
    throw new Error('hot-reload HMR audit targetFiles must contain absolute real artifact files')
  }
  return canonical
}

function configuration(value) {
  if (!record(value)) throw new Error('hot-reload HMR audit config must be an object')
  for (const key of Object.keys(value)) {
    if (!CONFIG_KEYS.has(key)) throw new Error(`hot-reload HMR audit config has unsupported field ${key}`)
  }
  if (typeof value.hmrEntryId !== 'string' || !HMR_ENTRY_ID.test(value.hmrEntryId)) {
    throw new Error('hot-reload HMR audit hmrEntryId must identify one transaction HMR entry')
  }
  if (!Array.isArray(value.targetFiles) || value.targetFiles.length < 1 || value.targetFiles.length > 128) {
    throw new Error('hot-reload HMR audit targetFiles must be a bounded non-empty array')
  }
  const targetFiles = value.targetFiles.map(canonicalFile)
  if (new Set(targetFiles).size !== targetFiles.length) {
    throw new Error('hot-reload HMR audit targetFiles contain duplicates')
  }
  return { hmrEntryId: value.hmrEntryId, targetFiles }
}

function activeOfficialRuntime(ctx) {
  if (typeof ctx?.loader?.import !== 'function' || typeof ctx.loader.unwrapExports !== 'function'
    || typeof ctx?.registry?.get !== 'function') {
    throw new Error('hot-reload HMR audit requires public loader import and registry APIs')
  }
  return Promise.resolve(ctx.loader.import(HMR_MODULE)).then((exports) => {
    const callback = ctx.loader.unwrapExports(exports)
    const runtime = ctx.registry.get(callback)
    if (!runtime || runtime.callback !== callback || !runtime.fibers
      || typeof runtime.fibers[Symbol.iterator] !== 'function') {
      throw new Error('hot-reload HMR audit could not resolve the official HMR runtime')
    }
    return [...runtime.fibers].filter(fiber => fiber?.state !== DISPOSED)
  })
}

function auditedFiber(fiber) {
  if (!fiber || fiber.state !== ACTIVE) {
    throw new Error('hot-reload HMR audit found an unsettled official HMR fiber')
  }
  const config = record(fiber.config)
  const service = record(fiber.ctx?.hmr)
  if (!config || !service || service.config !== fiber.config || service.ctx?.fiber !== fiber
    || typeof service.baseDir !== 'string' || !isAbsolute(service.baseDir)
    || !existsSync(service.baseDir)) {
    throw new Error('hot-reload HMR audit could not prove a fiber public config/baseDir/service identity')
  }
  const baseDir = realpathSync(service.baseDir)
  if (!lstatSync(baseDir).isDirectory() || !Array.isArray(config.root)) {
    throw new Error('hot-reload HMR audit found an unprovable watch root')
  }
  const roots = config.root.map((item) => {
    if (typeof item !== 'string' || item.length === 0 || item.length > 4_096 || /[*?{}[\]!]/.test(item)) {
      throw new Error('hot-reload HMR audit found a dynamic or wildcard watch root')
    }
    const watched = resolve(baseDir, item)
    if (!existsSync(watched)) throw new Error('hot-reload HMR audit found a non-real watch root')
    return realpathSync(watched)
  })
  if (new Set(roots).size !== roots.length) throw new Error('hot-reload HMR audit found duplicate watch roots')
  return { entry: fiber.entry, roots }
}

/**
 * Audit every live official HMR fiber using public Loader, registry, Fiber and
 * Hmr service state. This reads no module cache or watcher internals.
 */
export async function auditActiveHmr(ctx, rawConfig) {
  const config = configuration(rawConfig)
  const fibers = await activeOfficialRuntime(ctx)
  const audited = fibers.map(auditedFiber)
  if (typeof ctx.loader.entries !== 'function') {
    throw new Error('hot-reload HMR audit requires public loader entry enumeration')
  }
  const loaderEntries = [...ctx.loader.entries()]
  const transactions = audited.filter(fiber => fiber.entry?.options?.id === config.hmrEntryId
    && fiber.entry?.options?.name === HMR_MODULE
    && loaderEntries.filter(entry => entry === fiber.entry).length === 1)
  if (transactions.length !== 1) {
    throw new Error('hot-reload HMR audit requires exactly one active transaction HMR fiber')
  }
  if (transactions[0].roots.length !== config.targetFiles.length
    || transactions[0].roots.some((root, index) => root !== config.targetFiles[index])) {
    throw new Error('hot-reload HMR audit transaction roots do not exactly match targetFiles')
  }

  let fallbackFibers = 0
  let nonOverlappingFibers = 0
  for (const fiber of audited) {
    if (fiber === transactions[0]) continue
    if (fiber.roots.length === 0) {
      fallbackFibers += 1
      continue
    }
    if (fiber.roots.some(root => config.targetFiles.some(target => overlaps(root, target)))) {
      throw new Error('hot-reload HMR audit found another watcher overlapping targetFiles')
    }
    nonOverlappingFibers += 1
  }

  return {
    officialRuntimeFibers: audited.length,
    transactionFibers: 1,
    fallbackFibers,
    nonOverlappingFibers,
    targetFileCount: config.targetFiles.length,
  }
}
