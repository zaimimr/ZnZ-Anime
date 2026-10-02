import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { memoryKV } from './kv'

const env = { PAIRS: memoryKV(), ANILIST_CLIENT_ID: '', MAL_CLIENT_ID: '', MAL_CLIENT_SECRET: '' }
afterEach(() => vi.unstubAllGlobals())

describe('justanime', () => {
  it('forwards API calls with the site origin and opens CORS', async () => {
    const fetchMock = vi.fn(async () => Response.json({ episodes: [] }, { headers: { 'access-control-allow-origin': 'https://justanime.to' } }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await worker.fetch(new Request('https://auth.test/justanime/anime/154587/episodes?page=2'), env)
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(await res.json()).toEqual({ episodes: [] })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://core.justanime.to/api/anime/154587/episodes?page=2')
    expect(init.headers).toMatchObject({ origin: 'https://justanime.to' })
  })

  it('passes upstream errors through', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Anime not found' }, { status: 404 })))
    const res = await worker.fetch(new Request('https://auth.test/justanime/anime/1/episodes?page=1'), env)
    expect(res.status).toBe(404)
  })
})
