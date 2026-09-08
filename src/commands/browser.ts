import { bindBrowserAccess, browserStartup, discoverBrowserHost, assertSameBrowserHost, openBrowserAdapter, proveBrowserAccess } from '../internal/browser-access.ts'
import { finding, printReport, report } from '../internal/io.ts'
import type { CliOptions } from '../internal/types.ts'

export async function cmdBrowser(args: string[], options: CliOptions, root: string): Promise<number> {
  try {
    const action = args[0] ?? 'status'
    if (args.length > 1 || !['status', 'bind', 'open'].includes(action)) throw new Error('usage: dshx browser status|bind|open')
    if (action === 'bind') {
      const startup = process.env.DSHX_WEB_STARTUP_URL
      if (!startup) throw new Error('WEB_AUTH_REQUIRED: pass the official startup URL privately in DSHX_WEB_STARTUP_URL, never as a CLI argument')
      const binding = await bindBrowserAccess(root, startup, 'launcher', options.timeoutMs)
      printReport(report('browser bind', [finding('ok', 'handoff-bound', 'Private browser handoff bound to the current Host; browser verification remains separate')], binding), options.json)
      return 0
    }
    const host = discoverBrowserHost(root)
    const access = browserStartup(root, host)
    await proveBrowserAccess(host, access.startup, options.timeoutMs)
    assertSameBrowserHost(host, discoverBrowserHost(root))
    const browser = action === 'open'
      ? await openBrowserAdapter(process.env.DSHX_BROWSER_ADAPTER, host, access.startup, options.timeoutMs)
      : undefined
    assertSameBrowserHost(host, discoverBrowserHost(root))
    printReport(report(`browser ${action}`, [
      finding('ok', 'web-authenticated', 'HTTP_AUTHENTICATED: current DSH boot page verified'),
      browser ? finding('ok', 'browser-authenticated', 'BROWSER_AUTHENTICATED: configured adapter completed an authenticated browser run; feature behavior remains unverified')
        : finding('info', 'browser-unverified', 'Browser access is separate; use browser open with an adapter for the permitted browser runtime'),
    ], { host, source: access.source, ...(browser ? { browser } : {}) }), options.json)
    return 0
  } catch (error) {
    // URL/parser/adapter errors must not echo private inputs.
    const message = error instanceof Error && /^(WEB_|BROWSER_|usage:)/.test(error.message)
      ? error.message : 'WEB_ACCESS_FAILED: local connection or handoff I/O failed'
    printReport(report('browser', [finding('error', 'browser-access', message)]), options.json)
    return 1
  }
}
