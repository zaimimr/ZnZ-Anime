import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/anilist/api', () => ({ saveEntry: vi.fn(async () => 1), deleteEntry: vi.fn(async () => {}), anilistEntry: vi.fn(async () => null) }))
vi.mock('../src/mal/api', () => ({ saveMalEntry: vi.fn(async () => {}), deleteMalEntry: vi.fn(async () => {}), malEntry: vi.fn(async () => ({ progress: 0, score: 0 })) }))

import { anilistEntry, saveEntry } from '../src/anilist/api'
import { setToken } from '../src/auth/tokens'
import { AuthError, HttpError } from '../src/http'
import { malEntry, saveMalEntry } from '../src/mal/api'
import { clearQueue, enqueue, readQueue } from '../src/sync/queue'
import { readLocal } from '../src/library'
import { flushQueue, NotOnMalError, removeEverywhere, saveEverywhere } from '../src/sync/writer'

const change = (malId: number, progress: number) => ({ anilistId: malId + 1, malId, status: 'watching' as const, progress, score: 0 })
const targets = () => readQueue().map((i) => [i.target, i.change.malId, i.change.progress])

beforeEach(() => {
  localStorage.clear()
  vi.mocked(saveEntry).mockReset().mockResolvedValue(1)
  vi.mocked(anilistEntry).mockReset().mockResolvedValue(null)
  vi.mocked(malEntry).mockReset().mockResolvedValue({ progress: 0, score: 0 })
  vi.mocked(saveMalEntry).mockReset().mockResolvedValue()
  setToken('anilist', { accessToken: 'A', expiresAt: Date.now() + 1e9 })
  setToken('mal', { accessToken: 'M', expiresAt: Date.now() + 1e9 })
})

describe('queue', () => {
  it('keeps only the latest change per site and anime', () => {
    enqueue('mal', change(1, 3))
    enqueue('anilist', change(1, 3))
    enqueue('mal', change(2, 1))
    enqueue('mal', change(1, 4))
    expect(targets()).toEqual([['anilist', 1, 3], ['mal', 2, 1], ['mal', 1, 4]])
  })
})

describe('saveEverywhere', () => {
  it('writes AniList first, then MAL', async () => {
    const order: string[] = []
    vi.mocked(saveEntry).mockImplementation(async () => { order.push('anilist'); return 1 })
    vi.mocked(saveMalEntry).mockImplementation(async () => { order.push('mal') })
    await saveEverywhere(change(1, 2))
    expect(order).toEqual(['anilist', 'mal'])
  })

  it('queues the MAL write when it fails', async () => {
    vi.mocked(saveMalEntry).mockRejectedValue(new TypeError('offline'))
    await saveEverywhere(change(1, 2))
    expect(targets()).toEqual([['mal', 1, 2]])
  })

  it('skips MAL when there is no MAL id or no MAL login', async () => {
    await saveEverywhere({ anilistId: 5, status: 'watching', progress: 1, score: 0 })
    localStorage.removeItem('znz.tokens.mal')
    await saveEverywhere(change(1, 2))
    expect(saveMalEntry).not.toHaveBeenCalled()
  })

  it('queues a failed AniList write and still writes MAL', async () => {
    vi.mocked(saveEntry).mockRejectedValue(new TypeError('offline'))
    await saveEverywhere(change(1, 2))
    expect(saveMalEntry).toHaveBeenCalled()
    expect(targets()).toEqual([['anilist', 1, 2]])
  })

  it('writes only the main list when syncing both is off', async () => {
    localStorage.setItem('znz.settings', JSON.stringify({ syncBoth: false }))
    await saveEverywhere(change(1, 2))
    expect(saveEntry).toHaveBeenCalled()
    expect(saveMalEntry).not.toHaveBeenCalled()
  })

  it('writes to MAL alone when only MAL is linked', async () => {
    localStorage.removeItem('znz.tokens.anilist')
    await saveEverywhere(change(1, 2))
    expect(saveEntry).not.toHaveBeenCalled()
    expect(saveMalEntry).toHaveBeenCalled()
    await expect(saveEverywhere({ anilistId: 5, status: 'watching', progress: 1, score: 0 })).rejects.toBeInstanceOf(NotOnMalError)
  })

  it('keeps the list on this TV when no account is linked', async () => {
    localStorage.clear()
    await saveEverywhere(change(1, 2))
    await saveEverywhere(change(1, 3))
    expect(saveEntry).not.toHaveBeenCalled()
    expect(readLocal()).toMatchObject([{ anilistId: 2, malId: 1, progress: 3, status: 'watching' }])
    await removeEverywhere(2, undefined, 1)
    expect(readLocal()).toEqual([])
  })

  it('returns the AniList list entry id', async () => {
    vi.mocked(saveEntry).mockResolvedValue(77)
    expect(await saveEverywhere(change(1, 2))).toBe(77)
  })

  it('queues server errors and rate limits but drops other rejections', async () => {
    vi.mocked(saveEntry).mockRejectedValue(new HttpError(503, 'x'))
    vi.mocked(saveMalEntry).mockRejectedValue(new HttpError(429, 'x'))
    await saveEverywhere(change(1, 2))
    expect(targets()).toEqual([['anilist', 1, 2], ['mal', 1, 2]])
    vi.mocked(saveEntry).mockRejectedValue(new HttpError(400, 'x'))
    vi.mocked(saveMalEntry).mockRejectedValue(new Error('bad'))
    await saveEverywhere(change(1, 3))
    expect(targets()).toEqual([])
  })

  it('queues and rethrows when MAL login is revoked', async () => {
    vi.mocked(saveMalEntry).mockRejectedValue(new AuthError('mal'))
    await expect(saveEverywhere(change(1, 2))).rejects.toBeInstanceOf(AuthError)
    expect(targets()).toEqual([['mal', 1, 2]])
  })
})

describe('queue cleanup', () => {
  it('drops an older queued save once a newer one succeeds', async () => {
    enqueue('anilist', change(1, 3))
    await saveEverywhere(change(1, 4))
    expect(targets()).toEqual([])
  })

  it('keeps a newer queued save that arrived during a flush', async () => {
    enqueue('mal', change(1, 3))
    vi.mocked(saveMalEntry).mockImplementationOnce(async () => { enqueue('mal', change(1, 4)) })
    await flushQueue(0)
    expect(targets()).toEqual([['mal', 1, 4]])
  })

  it('forgets queued saves for a removed show', async () => {
    enqueue('anilist', change(1, 3))
    enqueue('mal', change(1, 3))
    vi.mocked(saveEntry).mockClear()
    await removeEverywhere(2, undefined, 1)
    expect(targets()).toEqual([])
  })
})

describe('flushQueue', () => {
  it('sends queued AniList and MAL changes and keeps failed ones', async () => {
    enqueue('anilist', change(1, 2))
    enqueue('mal', change(1, 2))
    enqueue('mal', change(2, 3))
    vi.mocked(saveMalEntry).mockImplementation(async (c) => { if (c.malId === 2) throw new TypeError('x') })
    await flushQueue(0)
    expect(saveEntry).toHaveBeenCalledTimes(1)
    expect(targets()).toEqual([['mal', 2, 3]])
  })

  it('keeps MAL changes while MAL is not linked', async () => {
    enqueue('mal', change(1, 2))
    localStorage.removeItem('znz.tokens.mal')
    await flushQueue(0)
    expect(saveMalEntry).not.toHaveBeenCalled()
    expect(targets()).toEqual([['mal', 1, 2]])
  })

  it('keeps unsent items if the process dies mid-flush', async () => {
    enqueue('mal', change(1, 2))
    enqueue('mal', change(2, 3))
    vi.mocked(saveMalEntry).mockImplementationOnce(async () => {}).mockImplementationOnce(() => new Promise(() => {}))
    void flushQueue(0)
    await new Promise((r) => setTimeout(r, 0))
    expect(targets()).toEqual([['mal', 2, 3]])
  })

  it('drops a queued change when the remote list is already further', async () => {
    enqueue('anilist', change(1, 2))
    enqueue('mal', change(1, 2))
    vi.mocked(anilistEntry).mockResolvedValue({ progress: 5, updatedAt: 0 })
    vi.mocked(malEntry).mockResolvedValue({ progress: 1, score: 0, updatedAt: Date.now() + 60_000 })
    await flushQueue(0)
    expect(saveEntry).not.toHaveBeenCalled()
    expect(saveMalEntry).not.toHaveBeenCalled()
    expect(targets()).toEqual([])
  })

  it('sends a deliberate lower progress queued after the last remote change', async () => {
    enqueue('anilist', change(1, 2))
    vi.mocked(anilistEntry).mockResolvedValue({ progress: 12, updatedAt: Date.now() - 60_000 })
    await flushQueue(0)
    expect(saveEntry).toHaveBeenCalledTimes(1)
  })

  it('compares only progress for old queue items without a time', async () => {
    localStorage.setItem('znz.retry', JSON.stringify([{ target: 'mal', change: change(1, 2) }]))
    vi.mocked(malEntry).mockResolvedValue({ progress: 1, score: 0, updatedAt: Date.now() })
    await flushQueue(0)
    expect(saveMalEntry).toHaveBeenCalledTimes(1)
  })

  it('stops at the first rate limit', async () => {
    enqueue('anilist', change(1, 2))
    enqueue('anilist', change(2, 2))
    vi.mocked(saveEntry).mockRejectedValue(new HttpError(429, 'x'))
    await flushQueue(0)
    expect(saveEntry).toHaveBeenCalledTimes(1)
    expect(targets()).toEqual([['anilist', 1, 2], ['anilist', 2, 2]])
  })

  it('drops a change after five failed launches or a rejection', async () => {
    enqueue('mal', change(1, 2))
    enqueue('mal', change(2, 2))
    vi.mocked(saveMalEntry).mockImplementation(async (c) => { throw c.malId === 1 ? new TypeError('offline') : new HttpError(404, 'x') })
    await flushQueue(0)
    expect(targets()).toEqual([['mal', 1, 2]])
    for (let i = 0; i < 4; i++) await flushQueue(0)
    expect(targets()).toEqual([])
  })

  it('spaces out AniList writes', async () => {
    vi.useFakeTimers()
    enqueue('anilist', change(1, 2))
    enqueue('anilist', change(2, 2))
    const done = flushQueue(700)
    await vi.advanceTimersByTimeAsync(0)
    expect(saveEntry).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(700)
    await done
    expect(saveEntry).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('clears queued changes for one site', () => {
    enqueue('anilist', change(1, 2))
    enqueue('mal', change(1, 2))
    clearQueue('mal')
    expect(targets()).toEqual([['anilist', 1, 2]])
  })
})
