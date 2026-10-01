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

  it('retries 503 and network errors', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)
    const pending = request('https://x.test')
    await vi.advanceTimersByTimeAsync(5000)
    expect(await (await pending).text()).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('throws with retryAfter when 429 asks to wait too long', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '120' } }))
    vi.stubGlobal('fetch', fetchMock)
    const error = await request('https://x.test').catch((e) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect(error.retryAfter).toBe(120)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('honours a Retry-After date', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': new Date(Date.now() + 30000).toUTCString() } }))
      .mockResolvedValueOnce(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)
    const pending = request('https://x.test')
    await vi.advanceTimersByTimeAsync(20000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(11000)
    expect(await (await pending).text()).toBe('ok')
  })

  it('aborts after the timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))))
    const pending = request('https://x.test').catch((e) => e)
    await vi.advanceTimersByTimeAsync(10000)
    expect((await pending).name).toBe('AbortError')
  })
})
