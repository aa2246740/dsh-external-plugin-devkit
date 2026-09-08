/** Private, origin-bound authentication for current-Host lifecycle proofs. */
export class WebProofAuthError extends Error {}

export function boundWebUrl(input: string | URL, origin: string): URL {
  let url: URL
  try { url = new URL(input, origin) } catch { throw new WebProofAuthError('WEB_AUTH_INVALID_URL: invalid local Web address') }
  if (url.origin !== origin || url.username || url.password) {
    throw new WebProofAuthError('WEB_AUTH_ORIGIN_MISMATCH: requests must stay on the selected loopback Host')
  }
  return url
}

export function validateWebStartupUrl(input: string | URL, port: number): URL {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new WebProofAuthError('WEB_AUTH_INVALID_PORT')
  const url = boundWebUrl(input, `http://127.0.0.1:${port}`)
  if (url.pathname !== '/' || url.hash || [...url.searchParams.keys()].some(key => key !== 'token')
    || url.searchParams.getAll('token').length > 1 || (url.searchParams.has('token') && !url.searchParams.get('token'))) {
    throw new WebProofAuthError('WEB_AUTH_INVALID_URL: use the official root startup URL')
  }
  return url
}

export function createWebProofRequest(port: number, startup = process.env.DSHX_WEB_STARTUP_URL, timeoutMs = 10_000) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new WebProofAuthError('WEB_AUTH_INVALID_TIMEOUT')
  const origin = `http://127.0.0.1:${port}`
  // Validate port even for legacy unauthenticated Hosts.
  const launch = startup ? validateWebStartupUrl(startup, port) : undefined
  validateWebStartupUrl(origin, port)
  let cookie = ''
  let exchange: Promise<void> | undefined
  const authenticate = async (): Promise<void> => {
    if (!launch) throw new WebProofAuthError('WEB_AUTH_REQUIRED: bind the official startup URL privately or refresh the Creator bridge')
    const login = await fetch(launch, { signal: AbortSignal.timeout(timeoutMs), redirect: 'manual' })
    try {
      const location = login.headers.get('location')
      if (location) boundWebUrl(location, origin)
      const received = login.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ')
      if (login.status !== 303 || !location || !received) {
        throw new WebProofAuthError('WEB_AUTH_REQUIRED: current Host authentication exchange failed; refresh the launcher handoff')
      }
      cookie = received
    } finally { await login.body?.cancel() }
  }
  return async (input: string | URL, init: RequestInit = {}): Promise<Response> => {
    const url = boundWebUrl(input, origin)
    const timeout = AbortSignal.timeout(timeoutMs)
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
    const send = () => {
      const headers = new Headers(init.headers)
      headers.delete('cookie')
      if (cookie) headers.set('cookie', cookie)
      return fetch(url, { ...init, signal, redirect: 'manual', headers })
    }
    let response = await send()
    if (response.status === 401 && launch) {
      await response.body?.cancel()
      // All concurrent callers await one exchange. Each waiter retains its own
      // cancellation/deadline; cancelling one must not poison the others.
      exchange ??= authenticate()
      await new Promise<void>((resolve, reject) => {
        const abort = () => { cleanup(); reject(signal.reason) }
        const cleanup = () => signal.removeEventListener('abort', abort)
        if (signal.aborted) return reject(signal.reason)
        signal.addEventListener('abort', abort, { once: true })
        exchange!.then(() => { cleanup(); resolve() }, error => { cleanup(); reject(error) })
      })
      response = await send()
    }
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel()
      throw new WebProofAuthError('WEB_AUTH_REQUIRED: current Host rejected authentication; refresh the private launcher or Creator handoff')
    }
    if (response.status >= 300 && response.status < 400) {
      try {
        const location = response.headers.get('location')
        if (location) boundWebUrl(location, origin)
        throw new WebProofAuthError('WEB_AUTH_UNEXPECTED_REDIRECT: protected resources must not redirect')
      } finally { await response.body?.cancel() }
    }
    return response
  }
}
