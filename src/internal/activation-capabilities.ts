import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DumpEntry } from './dsh.ts'

export type CapabilityState = 'supported' | 'unavailable' | 'unknown'

/** Disk evidence for the selected runtime; this is never proof of a live page. */
export interface ActivationCapabilities {
  runtimeVersion?: string
  runtimeSource: 'calling-host' | 'selected-checkout' | 'unknown'
  profileHmr: CapabilityState
  bundleRefresh: CapabilityState
  clientGraphSync: CapabilityState
}

/** Read the selected application's package version without importing Host code. */
export function runtimeVersion(root: string | undefined): string | undefined {
  if (!root) return undefined
  for (const path of [join(root, 'node_modules/@deepseek-ai/dsh/package.json'), join(root, 'apps/cli/package.json')]) {
    if (!existsSync(path)) continue
    try {
      const pkg = JSON.parse(readFileSync(path, 'utf8')) as { name?: string; version?: string }
      if (pkg.name === '@deepseek-ai/dsh' && typeof pkg.version === 'string') return pkg.version
    } catch { return undefined }
  }
  return undefined
}

/** RC2's public HMR contract requires both the runtime and its configured provider. */
export function activationCapabilities(
  version: string | undefined,
  entries: readonly DumpEntry[] | undefined,
  source: ActivationCapabilities['runtimeSource'],
): ActivationCapabilities {
  const active = (name: string) => entries?.some(entry => entry.name === name && !entry.disabled) === true
  // Keep unqualified versions undecided instead of extrapolating a restart rule.
  const knownRuntime = version === '0.2.0-rc.2'
  const profileHmr: CapabilityState = entries === undefined ? 'unknown'
    : active('@deepseek-ai/dsh-hmr') ? 'supported' : 'unavailable'
  return {
    runtimeVersion: version,
    runtimeSource: source,
    profileHmr,
    bundleRefresh: !knownRuntime || entries === undefined ? 'unknown' : profileHmr,
    clientGraphSync: !knownRuntime || entries === undefined ? 'unknown'
      : active('@deepseek-ai/dsh-client-hmr') ? 'supported' : 'unavailable',
  }
}
