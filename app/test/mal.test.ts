import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getToken, setToken } from '../src/auth/tokens'
import { AuthError } from '../src/http'
import { fetchMalList, malEntry, saveMalEntry } from '../src/mal/api'

beforeEach(() => { localStorage.clear(); setToken('mal', { accessToken: 'MT', refreshToken: 'R', expiresAt: Date.now() + 1e9 }) })
afterEach(() => vi.unstubAllGlobals())

describe('mal api', () => {
  it('pages through the list and maps statuses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: [{ node: { id: 1, title: 'A' }, list_status: { status: 'on_hold', num_episodes_watched: 4, score: 6 } }], paging: { next: 'https://api.myanimelist.net/v2/users/@me/animelist?offset=1000' } }))
      .mockResolvedValueOnce(Response.json({ data: [{ node: { id: 2, title: 'B' }, list_status: { status: 'plan_to_watch', num_episodes_watched: 0, score: 0 } }], paging: {} }))
    vi.stubGlobal('fetch', fetchMock)
    const list = await fetchMalList()
    expect(list).toEqual([
      { malId: 1, title: 'A', status: 'paused', progress: 4, score: 6 },
      { malId: 2, title: 'B', status: 'planning', progress: 0, score: 0 },
    ])
    expect(fetchMock.mock.calls[0][0]).toContain('/v2/users/@me/animelist?fields=list_status&limit=1000&nsfw=true')
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.myanimelist.net/v2/users/@me/animelist?offset=1000')
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get('authorization')).toBe('Bearer MT')
  })

  it('clears a revoked MAL token and reports AuthError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    await expect(saveMalEntry({ malId: 9, status: 'watching', progress: 3, score: 8 })).rejects.toBeInstanceOf(AuthError)
    expect(getToken('mal')).toBeNull()
  })

  it('patches list status as form data', async () => {
    const fetchMock = vi.fn(async () => Response.json({}))
    vi.stubGlobal('fetch', fetchMock)
    await saveMalEntry({ malId: 9, status: 'watching', progress: 3, score: 8 })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.myanimelist.net/v2/anime/9/my_list_status')
    expect(init.method).toBe('PATCH')
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({ status: 'watching', num_watched_episodes: '3', score: '8', is_rewatching: 'false' })
  })

  it('saves a rewatch as completed with the rewatch flag', async () => {
    const fetchMock = vi.fn(async () => Response.json({}))
    vi.stubGlobal('fetch', fetchMock)
    await saveMalEntry({ malId: 9, status: 'rewatching', progress: 2, score: 0 })
    const body = new URLSearchParams((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect([body.get('status'), body.get('is_rewatching')]).toEqual(['completed', 'true'])
  })

  it('reads the rewatch flag back as rewatching', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ data: [{ node: { id: 1, title: 'A' }, list_status: { status: 'completed', num_episodes_watched: 2, score: 0, is_rewatching: true } }], paging: {} }))
      .mockResolvedValueOnce(Response.json({ my_list_status: { status: 'completed', num_episodes_watched: 3, score: 0, is_rewatching: true, updated_at: '2026-01-01T00:00:00Z' } })))
    expect((await fetchMalList())[0].status).toBe('rewatching')
    expect(await malEntry(1)).toEqual({ status: 'rewatching', progress: 3, score: 0, updatedAt: Date.parse('2026-01-01T00:00:00Z') })
  })
})
