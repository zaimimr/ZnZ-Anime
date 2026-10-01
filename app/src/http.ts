import type { Provider } from './types'

export class HttpError extends Error {
  status: number
  body: string
  retryAfter?: number
  constructor(status: number, url: string, body = '', retryAfter?: number) {
    super(`HTTP ${status} for ${url}`)
    this.status = status
    this.body = body
    if (retryAfter !== undefined) this.retryAfter = retryAfter
  }
}

export class AuthError extends Error {
  provider: Provider
  constructor(provider: Provider) {
    super(`${provider} login required`)
    this.provider = provider
  }
}

const TIMEOUT_MS = 10000
const MAX_WAIT_S = 60

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function retryAfterSeconds(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(seconds, 0)
  const date = Date.parse(header)
  return Number.isNaN(date) ? undefined : Math.max((date - Date.now()) / 1000, 0)
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const outer = init?.signal
  const forward = () => controller.abort()
  if (outer?.aborted) controller.abort()
  outer?.addEventListener('abort', forward)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener('abort', forward)
  }
}

export async function request(url: string, init?: RequestInit, opts: { provider?: Provider; retries?: number } = {}): Promise<Response> {
  const retries = opts.retries ?? 3
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetchWithTimeout(url, init)
    } catch (e) {
      if (e instanceof TypeError && attempt < retries && !init?.signal?.aborted) {
        await sleep(500 * 2 ** attempt)
        continue
      }
      throw e
    }
    if (res.ok) return res
    if (res.status === 429) {
      const wait = retryAfterSeconds(res.headers.get('retry-after'))
      if (attempt < retries && (wait ?? 0) <= MAX_WAIT_S) {
        await sleep((wait ?? 2 ** attempt) * 1000)
        continue
      }
      throw new HttpError(429, url, await res.text().catch(() => ''), wait)
    }
    if ([502, 503, 504].includes(res.status) && attempt < retries) {
      await sleep(500 * 2 ** attempt)
      continue
    }
    if (res.status === 401 && opts.provider) throw new AuthError(opts.provider)
    throw new HttpError(res.status, url, await res.text().catch(() => ''))
  }
}
