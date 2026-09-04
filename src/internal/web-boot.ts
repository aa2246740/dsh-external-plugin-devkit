export interface WebBootEntry {
  id: string
  url: string
}

export interface WebBootManifest {
  entries: WebBootEntry[]
}

export interface AuthenticatedWebPage {
  url: URL
  html: string
  cookie: string
}

type FetchLike = typeof fetch

function responseCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie()
  const raw = response.headers.get('set-cookie')
  return raw ? raw.split(/,(?=[^;]+=[^;]+)/u) : []
}

function cookieHeader(response: Response): string {
  return responseCookies(response)
    .map(value => value.split(';', 1)[0] ?? '')
    .filter(Boolean)
    .join('; ')
}

/** Read the ready URL emitted by an isolated official Web launcher. */
export function findWebStartupUrl(log: string, port: number): URL | undefined {
  const matches = [...log.matchAll(/^dsh web:\s+(https?:\/\/\S+)\s*$/gmu)]
  const value = matches.at(-1)?.[1]
  if (!value) return undefined
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === String(port)
    ? url
    : undefined
}

/** Parse the official Web boot assignment without evaluating page source. */
export function parseWebBootManifest(html: string): WebBootManifest | undefined {
  const match = /globalThis\["__DSH_BOOT__"\]\s*=\s*(\{.*?\})<\/script>/su.exec(html)
  if (!match?.[1]) return undefined
  try {
    const parsed: unknown = JSON.parse(match[1])
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const entries = Reflect.get(parsed, 'entries')
    if (!Array.isArray(entries)) return undefined
    const normalized: WebBootEntry[] = []
    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined
      const id = Reflect.get(entry, 'id')
      const url = Reflect.get(entry, 'url')
      if (typeof id !== 'string' || typeof url !== 'string') return undefined
      normalized.push({ id, url })
    }
    return { entries: normalized }
  } catch {
    return undefined
  }
}

/** Exchange the single-use launcher token for its local session cookie, then load the real page. */
export async function fetchAuthenticatedWebPage(startupUrl: URL, request: FetchLike = fetch): Promise<AuthenticatedWebPage> {
  const first = await request(startupUrl, { redirect: 'manual' })
  if (first.status === 200) {
    return { url: startupUrl, html: await first.text(), cookie: cookieHeader(first) }
  }
  if (first.status < 300 || first.status >= 400) {
    throw new Error(`Web startup URL returned ${first.status}`)
  }
  const location = first.headers.get('location')
  const cookie = cookieHeader(first)
  if (!location || !cookie) throw new Error('Web startup URL did not establish a local session cookie')
  const url = new URL(location, startupUrl)
  const page = await request(url, { headers: { cookie } })
  if (!page.ok) throw new Error(`authenticated Web page returned ${page.status}`)
  return { url, html: await page.text(), cookie }
}

/** Fetch a protected Web bundle through the temporary page's local session cookie. */
export async function fetchAuthenticatedWebResource(
  page: AuthenticatedWebPage,
  path: string,
  request: FetchLike = fetch,
): Promise<Response> {
  return await request(new URL(path, page.url), { headers: page.cookie ? { cookie: page.cookie } : {} })
}
