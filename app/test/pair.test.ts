import { afterEach, describe, expect, it, vi } from 'vitest'
import { pollPair, startPair } from '../src/auth/pair'

afterEach(() => vi.unstubAllGlobals())

describe('pair client', () => {
  it('starts a pair for a provider', async () => {
    const fetchMock = vi.fn(async () => Response.json({ code: 'ABC234', pairUrl: 'https://auth.test/login/ABC234' }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await startPair('mal')).toEqual({ code: 'ABC234', pairUrl: 'https://auth.test/login/ABC234' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://auth.test/pair')
    expect(JSON.parse(init.body as string)).toEqual({ provider: 'mal' })
  })

  it('maps poll responses', async () => {
    const tokens = { accessToken: 'A', expiresAt: 1 }
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ status: 'pending' }, { status: 202 }))
      .mockResolvedValueOnce(Response.json({ status: 'done', tokens }))
      .mockResolvedValueOnce(Response.json({ status: 'missing' }, { status: 404 })))
    expect(await pollPair('ABC234')).toBe('pending')
    expect(await pollPair('ABC234')).toEqual(tokens)
    expect(await pollPair('ABC234')).toBe('expired')
  })
})
