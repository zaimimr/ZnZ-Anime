import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthError, HttpError, request } from '../src/http'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('request', () => {
  it('returns ok responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok')))
    expect(await (await request('https://x.test')).text()).toBe('ok')
  })

  it('waits for Retry-After on 429 then retries', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)
    const pending = request('https://x.test')
    await vi.advanceTimersByTimeAsync(2000)
    expect(await (await pending).text()).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after the retry budget', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '1' } })))
    const pending = request('https://x.test', undefined, { retries: 1 }).catch((e) => e)
    await vi.advanceTimersByTimeAsync(5000)
    const error = await pending
    expect(error).toBeInstanceOf(HttpError)
    expect(error.status).toBe(429)
  })

  it('throws AuthError on 401 for a provider', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    const error = await request('https://x.test', undefined, { provider: 'anilist' }).catch((e) => e)
    expect(error).toBeInstanceOf(AuthError)
    expect(error.provider).toBe('anilist')
  })

  it('throws HttpError on 500', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    const error = await request('https://x.test').catch((e) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect(error.status).toBe(500)
  })
})
