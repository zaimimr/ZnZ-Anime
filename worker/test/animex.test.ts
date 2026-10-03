import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { memoryKV } from './kv'

const env = { PAIRS: memoryKV(), ANILIST_CLIENT_ID: '', MAL_CLIENT_ID: '', MAL_CLIENT_SECRET: '' }
afterEach(() => vi.unstubAllGlobals())

describe('animex', () => {
  it('forwards REST calls and opens CORS', async () => {
    const fetchMock = vi.fn(async () => Response.json([{ number: 1 }]))
    vi.stubGlobal('fetch', fetchMock)
    const res = await worker.fetch(new Request('https://auth.test/animex/episodes?id=frieren'), env)
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(await res.json()).toEqual([{ number: 1 }])
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://pp.animex.one/rest/api/episodes?id=frieren')
    expect(init.headers).toMatchObject({ origin: 'https://animex.one' })
  })

  it('forwards the GraphQL lookup as a POST', async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: { anime: { id: 'x' } } }))
    vi.stubGlobal('fetch', fetchMock)
    const body = JSON.stringify({ query: 'q', variables: { anilistId: 1 } })
    const res = await worker.fetch(new Request('https://auth.test/animex/graphql', { method: 'POST', body }), env)
    expect(await res.json()).toEqual({ data: { anime: { id: 'x' } } })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://graphql.animex.one/graphql')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(body)
  })
})
