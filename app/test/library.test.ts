import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/anilist/api', async (original) => ({
  ...(await original<typeof import('../src/anilist/api')>()),
  fetchList: vi.fn(async () => []),
  mediaLookup: vi.fn(async (by: string, ids: number[]) => new Map(ids.map((id) => [id, { id: by === 'id' ? id : id + 1, idMal: by === 'idMal' ? id : null, title: { romaji: `T${id}`, english: null, native: null }, coverImage: { large: '' }, episodes: 12, status: 'RELEASING', nextAiringEpisode: { episode: 5, airingAt: 1 } }]))),
}))
vi.mock('../src/mal/api', () => ({
  fetchMalList: vi.fn(async () => [{ malId: 100, title: 'A', status: 'watching', progress: 2, score: 7, updatedAt: 9 }]),
  malEntry: vi.fn(async () => ({ status: 'paused', progress: 8, score: 0 })),
}))

import { fetchList } from '../src/anilist/api'
import { setToken } from '../src/auth/tokens'
import { fetchLibrary, invalidateLibrary, libraryEntry, listSource, saveLocal, syncTargets } from '../src/library'

const token = { accessToken: 'x', expiresAt: Date.now() + 1e9 }

beforeEach(() => {
  localStorage.clear()
  invalidateLibrary()
})

describe('library', () => {
  it('picks AniList, then MAL, then this TV', () => {
    expect(listSource()).toBe('local')
    setToken('mal', token)
    expect(listSource()).toBe('mal')
    setToken('anilist', token)
    expect(listSource()).toBe('anilist')
    expect(syncTargets()).toEqual(['anilist', 'mal'])
    localStorage.setItem('znz.settings', JSON.stringify({ syncBoth: false }))
    expect(syncTargets()).toEqual(['anilist'])
  })

  it('builds the list from MAL alone', async () => {
    setToken('mal', token)
    const [item] = await fetchLibrary()
    expect(item.card.id).toBe(101)
    expect(item.entry).toMatchObject({ anilistId: 101, malId: 100, status: 'watching', progress: 2, score: 7 })
    expect(item.aired).toBe(4)
    expect(fetchList).not.toHaveBeenCalled()
  })

  it('builds the list from this TV', async () => {
    saveLocal({ anilistId: 7, status: 'planning', progress: 0, score: 0 })
    const [item] = await fetchLibrary()
    expect(item.entry).toMatchObject({ anilistId: 7, status: 'planning' })
  })

  it('reads the entry from MAL when MAL is the main list', async () => {
    setToken('mal', token)
    const info = { id: 1, idMal: 100, listStatus: undefined, progress: 0, score: 0 } as never
    expect(await libraryEntry(info)).toEqual({ status: 'paused', progress: 8, score: 0 })
  })

  it('reloads from the next source when an expired AniList token fails the first load', async () => {
    setToken('anilist', token)
    vi.mocked(fetchList).mockImplementationOnce(async () => {
      localStorage.removeItem('znz.tokens.anilist')
      throw new Error('HTTP 400')
    })
    expect(await fetchLibrary()).toEqual([])
  })
})
