#!/usr/bin/env node
/** Automated WebUI smoke adapter for Codex's globally pinned headless runtime.
 * Closes its test contexts when done; this is not an interactive-browser bridge.
 */
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

let browser
try {
  let raw = ''
  for await (const chunk of process.stdin) {
    raw += chunk
    if (raw.length > 16 * 1024) throw new Error('input too large')
  }
  const input = JSON.parse(raw)
  const startup = new URL(input.startupUrl)
  if (input.version !== 1 || startup.origin !== input.origin || startup.protocol !== 'http:'
    || startup.hostname !== '127.0.0.1' || startup.username || startup.password) throw new Error('invalid handoff')
  const { launchPinnedChromium } = await import(pathToFileURL(resolve(homedir(), '.codex/playwright-runtime/runtime.mjs')).href)
  browser = await launchPinnedChromium()
  const timeout = Math.min(input.timeoutMs, 30_000)
  // Keep both independent contexts alive until both have authenticated.
  for (let index = 0; index < 2; index++) {
    const context = await browser.newContext()
    const page = await context.newPage()
    const response = await page.goto(startup.href, { timeout })
    if (response?.status() !== 200 || new URL(page.url()).origin !== input.origin
      || new URL(page.url()).searchParams.has('token')) throw new Error('authentication failed')
    await page.waitForFunction(() => {
      const boot = globalThis.__DSH_BOOT__ ?? window.__DSH_BOOT__
      return Array.isArray(boot?.entries) && document.querySelector('button') !== null
    }, undefined, { timeout })
  }
  process.stdout.write(JSON.stringify({ status: 'BROWSER_AUTHENTICATED', origin: input.origin }))
} catch {
  // Browser exceptions can contain the launch URL. Keep adapter diagnostics private.
  process.stderr.write('Codex WebUI smoke failed; check the pinned runtime and local-browser access.\n')
  process.exitCode = 1
} finally { await browser?.close() }
