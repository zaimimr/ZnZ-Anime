import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setToken } from '../src/auth/tokens'
import { fetchMalList, saveMalEntry } from '../src/mal/api'

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

  it('patches list status as form data', async () => {
    const fetchMock = vi.fn(async () => Response.json({}))
    vi.stubGlobal('fetch', fetchMock)
    await saveMalEntry({ malId: 9, status: 'watching', progress: 3, score: 8 })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.myanimelist.net/v2/anime/9/my_list_status')
    expect(init.method).toBe('PATCH')
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({ status: 'watching', num_watched_episodes: '3', score: '8' })
  })
})
