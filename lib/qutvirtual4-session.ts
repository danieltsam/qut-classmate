export const QUT_VIRTUAL4_BASE = "https://qutvirtual4.qut.edu.au"

export const QUT_VIRTUAL4_BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-AU,en;q=0.9",
} as const

export interface Virtual4SearchPage {
  html: string
  csrfToken: string
  cookieHeader: string
}

function buildCookieHeader(setCookies: string[]): string {
  return setCookies
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean)
    .join("; ")
}

export function extractCsrfToken(html: string): string | null {
  const match = html.match(/Liferay\.authToken\s*=\s*'([^']+)'/)
  return match?.[1] ?? null
}

export async function fetchVirtual4SearchPage(searchUrl: string): Promise<Virtual4SearchPage> {
  const response = await fetch(searchUrl, {
    headers: QUT_VIRTUAL4_BROWSER_HEADERS,
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch QUT Virtual search page (${response.status})`)
  }

  const html = await response.text()
  const csrfToken = extractCsrfToken(html)

  if (!csrfToken) {
    throw new Error("Could not extract CSRF token from QUT Virtual search page")
  }

  const setCookies =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : []

  return {
    html,
    csrfToken,
    cookieHeader: buildCookieHeader(setCookies),
  }
}

export function buildUnitSearchUrl(options: {
  query: string
  start?: number
  showOldUnits?: boolean
  sortKey?: number
}): string {
  const url = new URL(`${QUT_VIRTUAL4_BASE}/web/qut/search`)
  url.searchParams.set("profile", "UNIT")
  url.searchParams.set("params.query", options.query)
  url.searchParams.set("params.showOldUnits", options.showOldUnits ? "true" : "false")
  url.searchParams.set("params.sortKey", String(options.sortKey ?? 0))

  if (options.start && options.start > 0) {
    url.searchParams.set("params.start", String(options.start))
  }

  return url.toString()
}
