/** Private, origin-bound authentication for current-Host lifecycle proofs. */
export class WebProofAuthError extends Error {}

export function createWebProofRequest(port: number, startup = process.env.DSHX_WEB_STARTUP_URL) {
  const origin = `http://127.0.0.1:${port}`
  let cookie = ''
  let exchanged = false
  const bounded = (input: string | URL) => {
    const url = new URL(input, origin)
    if (url.origin !== origin || url.username || url.password) {
      throw new WebProofAuthError('WEB_AUTH_ORIGIN_MISMATCH: proof requests must stay on the selected loopback Host')
    }
    return url
  }
  const launch = startup ? bounded(startup) : undefined
  return async (input: string | URL, init: RequestInit = {}): Promise<Response> => {
    const url = bounded(input)
    const send = () => fetch(url, { ...init, redirect: 'manual', headers: cookie ? { cookie } : {} })
    let response = await send()
    if (response.status === 401 && launch && !exchanged) {
      exchanged = true
      await response.body?.cancel()
      const login = await fetch(launch, { signal: init.signal, redirect: 'manual' })
      const location = login.headers.get('location')
      if (location) bounded(new URL(location, launch))
      cookie = login.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ')
      await login.body?.cancel()
      if (login.status !== 303 || !location || !cookie) {
        throw new WebProofAuthError('WEB_AUTH_REQUIRED: current Host authentication exchange failed; repair the private bridge credential, do not disable authentication or paste tokens into chat')
      }
      response = await send()
    }
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel()
      throw new WebProofAuthError('WEB_AUTH_REQUIRED: current Host proof needs internal authentication; update the Creator bridge or supply DSHX_WEB_STARTUP_URL privately from the external launcher, never through chat')
    }
    return response
  }
}
