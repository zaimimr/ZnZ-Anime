import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { anilistIdsForMal, fetchList, fromStatus, mediaByIds, saveEntry, toStatus, trendsPage } from '../src/anilist/api'
import { setToken } from '../src/auth/tokens'

function gqlReply(data: unknown) {
  return vi.fn(async () => Response.json({ data }))
}
const media = (id: number, extra = {}) => ({ id, idMal: id + 1000, title: { romaji: `R${id}`, english: `E${id}`, native: `N${id}` }, coverImage: { large: `c${id}` }, episodes: 12, ...extra })

beforeEach(() => { localStorage.clear(); setToken('anilist', { accessToken: 'AT', expiresAt: Date.now() + 1e9 }) })
afterEach(() => vi.unstubAllGlobals())

describe('status mapping', () => {
  it('maps AniList statuses both ways', () => {
    expect(toStatus('CURRENT')).toBe('watching')
    expect(toStatus('REPEATING')).toBe('watching')
    expect(toStatus('PLANNING')).toBe('planning')
    expect(fromStatus('paused')).toBe('PAUSED')
    expect(fromStatus('watching')).toBe('CURRENT')
  })
})

describe('anilist api', () => {
  it('flattens the list collection with bearer auth', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: { Viewer: { id: 7, name: 'z' } } }))
      .mockResolvedValueOnce(Response.json({ data: { MediaListCollection: { lists: [
        { entries: [{ mediaId: 1, status: 'CURRENT', progress: 3, score: 8, updatedAt: 50, media: media(1) }] },
        { entries: [{ mediaId: 2, status: 'COMPLETED', progress: 12, score: 0, updatedAt: 60, media: media(2, { idMal: null }) }] },
      ] } } }))
    vi.stubGlobal('fetch', fetchMock)
    const items = await fetchList()
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get('authorization')).toBe('Bearer AT')
    expect(items).toHaveLength(2)
    expect(items[0].entry).toEqual({ anilistId: 1, malId: 1001, title: 'E1', status: 'watching', progress: 3, score: 8 })
    expect(items[0].updatedAt).toBe(50_000)
    expect(items[1].entry.malId).toBeUndefined()
  })

  it('saves with scoreRaw on a 0 to 100 scale', async () => {
    const fetchMock = gqlReply({ SaveMediaListEntry: { id: 1 } })
    vi.stubGlobal('fetch', fetchMock)
    await saveEntry({ anilistId: 5, status: 'completed', progress: 12, score: 7 })
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.variables).toEqual({ mediaId: 5, status: 'COMPLETED', progress: 12, scoreRaw: 70 })
  })

  it('keeps requested order in mediaByIds', async () => {
    vi.stubGlobal('fetch', gqlReply({ Page: { media: [media(2), media(1)] } }))
    expect((await mediaByIds([1, 2])).map((c) => c.id)).toEqual([1, 2])
  })

  it('maps MAL ids to AniList ids', async () => {
    vi.stubGlobal('fetch', gqlReply({ Page: { media: [{ id: 10, idMal: 99 }] } }))
    expect((await anilistIdsForMal([99, 98])).get(99)).toBe(10)
  })

  it('returns only non-adult anime trend rows', async () => {
    vi.stubGlobal('fetch', gqlReply({ Page: { pageInfo: { hasNextPage: true }, mediaTrends: [
      { mediaId: 1, trending: 50, media: { type: 'ANIME', isAdult: false } },
      { mediaId: 2, trending: 40, media: { type: 'MANGA', isAdult: false } },
      { mediaId: 3, trending: 30, media: { type: 'ANIME', isAdult: true } },
    ] } }))
    expect(await trendsPage(0, 1)).toEqual({ rows: [{ mediaId: 1, trending: 50 }], hasNext: true })
  })

  it('surfaces GraphQL errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ errors: [{ message: 'boom' }] })))
    await expect(mediaByIds([1])).rejects.toThrow('boom')
  })
})
