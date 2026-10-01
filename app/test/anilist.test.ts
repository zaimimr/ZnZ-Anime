import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { anilistEntry, anilistIdsForMal, fetchList, fromStatus, mediaByIds, saveEntry, toRelated, toStatus, trendingWithHistory } from '../src/anilist/api'
import { getToken, setToken } from '../src/auth/tokens'
import { AuthError } from '../src/http'

function gqlReply(data: unknown) {
  return vi.fn(async () => Response.json({ data }))
}
const media = (id: number, extra = {}) => ({ id, idMal: id + 1000, title: { romaji: `R${id}`, english: `E${id}`, native: `N${id}` }, coverImage: { large: `c${id}` }, episodes: 12, ...extra })

beforeEach(() => { localStorage.clear(); setToken('anilist', { accessToken: 'AT', expiresAt: Date.now() + 1e9 }) })
afterEach(() => vi.unstubAllGlobals())

describe('status mapping', () => {
  it('maps AniList statuses both ways', () => {
    expect(toStatus('CURRENT')).toBe('watching')
    expect(toStatus('REPEATING')).toBe('rewatching')
    expect(fromStatus('rewatching')).toBe('REPEATING')
    expect(toStatus('PLANNING')).toBe('planning')
    expect(fromStatus('paused')).toBe('PAUSED')
    expect(fromStatus('watching')).toBe('CURRENT')
  })
})

describe('toRelated', () => {
  const node = (id: number, year: number | null, type = 'ANIME') => ({ id, idMal: null, title: { romaji: `A${id}`, english: null, native: null }, coverImage: { large: '' }, episodes: null, type, startDate: { year, month: 1, day: 1 } })

  it('keeps seasons and side stories in release order', () => {
    const related = toRelated([
      { relationType: 'SEQUEL', node: node(3, 2026) },
      { relationType: 'ADAPTATION', node: node(4, 2020, 'MANGA') },
      { relationType: 'CHARACTER', node: node(5, 2021) },
      { relationType: 'PREQUEL', node: node(1, 2020) },
      { relationType: 'SIDE_STORY', node: node(2, null) },
    ])
    expect(related.map((r) => [r.id, r.relation])).toEqual([[1, 'Prequel'], [3, 'Sequel'], [2, 'Side story']])
  })
})

describe('anilist api', () => {
  it('flattens the list collection with bearer auth', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: { Viewer: { id: 7, name: 'z' } } }))
      .mockResolvedValueOnce(Response.json({ data: { MediaListCollection: { lists: [
        { isCustomList: false, entries: [{ mediaId: 1, status: 'CURRENT', progress: 3, score: 8, updatedAt: 50, media: media(1) }] },
        { isCustomList: false, entries: [{ mediaId: 2, status: 'COMPLETED', progress: 12, score: 0, updatedAt: 60, media: media(2, { idMal: null }) }] },
        { isCustomList: true, entries: [{ mediaId: 1, status: 'CURRENT', progress: 3, score: 8, updatedAt: 50, media: media(1) }] },
      ] } } }))
    vi.stubGlobal('fetch', fetchMock)
    const items = await fetchList()
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get('authorization')).toBe('Bearer AT')
    expect(items).toHaveLength(2)
    expect(items[0].entry).toEqual({ anilistId: 1, malId: 1001, title: 'E1', status: 'watching', progress: 3, score: 8 })
    expect(items[0].updatedAt).toBe(50_000)
    expect(items[1].entry.malId).toBeUndefined()
  })

  it('saves with scoreRaw on a 0 to 100 scale and returns the list entry id', async () => {
    const fetchMock = gqlReply({ SaveMediaListEntry: { id: 31 } })
    vi.stubGlobal('fetch', fetchMock)
    expect(await saveEntry({ anilistId: 5, status: 'completed', progress: 12, score: 7 })).toBe(31)
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.variables).toEqual({ mediaId: 5, status: 'COMPLETED', progress: 12, scoreRaw: 70 })
  })

  it('saves a rewatch as REPEATING', async () => {
    const fetchMock = gqlReply({ SaveMediaListEntry: { id: 1 } })
    vi.stubGlobal('fetch', fetchMock)
    await saveEntry({ anilistId: 5, status: 'rewatching', progress: 2, score: 0 })
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).variables.status).toBe('REPEATING')
  })

  it('reads the remote list entry progress and update time', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ data: { Media: { mediaListEntry: { progress: 4, updatedAt: 9 } } } }))
      .mockResolvedValueOnce(Response.json({ data: { Media: { mediaListEntry: null } } })))
    expect(await anilistEntry(1)).toEqual({ progress: 4, updatedAt: 9000 })
    expect(await anilistEntry(2)).toBeNull()
  })

  it('keeps requested order in mediaByIds', async () => {
    vi.stubGlobal('fetch', gqlReply({ Page: { media: [media(2), media(1)] } }))
    expect((await mediaByIds([1, 2])).map((c) => c.id)).toEqual([1, 2])
  })

  it('maps MAL ids to AniList ids', async () => {
    vi.stubGlobal('fetch', gqlReply({ Page: { media: [{ id: 10, idMal: 99 }] } }))
    expect((await anilistIdsForMal([99, 98])).get(99)).toBe(10)
  })

  it('returns trending anime with their daily trend history', async () => {
    const fetchMock = gqlReply({ Page: { pageInfo: { hasNextPage: true }, media: [
      { ...media(1), trends: { nodes: [{ date: 100, trending: 50 }, { date: 50, trending: 20 }] } },
    ] } })
    vi.stubGlobal('fetch', fetchMock)
    const result = await trendingWithHistory(2)
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.variables).toEqual({ page: 2 })
    expect(new Headers((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get('authorization')).toBeNull()
    expect(result.hasNext).toBe(true)
    expect(result.items[0].card.id).toBe(1)
    expect(result.items[0].history).toEqual([{ date: 100, trending: 50 }, { date: 50, trending: 20 }])
  })

  it('clears an invalid AniList token and retries a read without it', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      new Headers(init.headers).get('authorization')
        ? Response.json({ data: null, errors: [{ message: 'Invalid token', status: 400 }] }, { status: 400 })
        : Response.json({ data: { Page: { media: [] } } }))
    vi.stubGlobal('fetch', fetchMock)
    const expired = vi.fn()
    window.addEventListener('znz:expired', expired)
    await expect(mediaByIds([1])).resolves.toEqual([])
    window.removeEventListener('znz:expired', expired)
    expect(getToken('anilist')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(expired).toHaveBeenCalledTimes(1)
  })

  it('throws AuthError when a write is rejected for the token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: null, errors: [{ message: 'Invalid token', status: 400 }] }, { status: 400 })))
    await expect(saveEntry({ anilistId: 1, status: 'watching', progress: 1, score: 0 })).rejects.toBeInstanceOf(AuthError)
    expect(getToken('anilist')).toBeNull()
  })

  it('keeps the token on other 400 errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: null, errors: [{ message: 'Cannot query field', status: 400 }] }, { status: 400 })))
    await expect(mediaByIds([1])).rejects.not.toBeInstanceOf(AuthError)
    expect(getToken('anilist')).not.toBeNull()
  })

  it('surfaces GraphQL errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ errors: [{ message: 'boom' }] })))
    await expect(mediaByIds([1])).rejects.toThrow('boom')
  })
})
