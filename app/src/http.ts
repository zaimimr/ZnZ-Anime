import type { Provider } from './types'

export class HttpError extends Error {
  status: number
  body: string
  constructor(status: number, url: string, body = '') {
    super(`HTTP ${status} for ${url}`)
    this.status = status
    this.body = body
  }
}

export class AuthError extends Error {
  provider: Provider
  constructor(provider: Provider) {
    super(`${provider} login required`)
    this.provider = provider
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function request(url: string, init?: RequestInit, opts: { provider?: Provider; retries?: number } = {}): Promise<Response> {
  const retries = opts.retries ?? 3
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init)
    if (res.ok) return res
    if (res.status === 429 && attempt < retries) {
      const seconds = Math.min(Number(res.headers.get('retry-after')) || 2 ** attempt, 5)
      await sleep(seconds * 1000)
      continue
    }
    if (res.status === 401 && opts.provider) throw new AuthError(opts.provider)
    throw new HttpError(res.status, url, await res.text().catch(() => ''))
  }
}
