import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/anilist/api', () => ({ saveEntry: vi.fn(async () => {}) }))
vi.mock('../src/mal/api', () => ({ saveMalEntry: vi.fn(async () => {}) }))

import { saveEntry } from '../src/anilist/api'
import { setToken } from '../src/auth/tokens'
import { AuthError } from '../src/http'
import { saveMalEntry } from '../src/mal/api'
import { enqueue, readQueue } from '../src/sync/queue'
import { flushQueue, saveEverywhere } from '../src/sync/writer'

const change = (malId: number, progress: number) => ({ anilistId: malId + 1, malId, status: 'watching' as const, progress, score: 0 })
const targets = () => readQueue().map((i) => [i.target, i.change.malId, i.change.progress])

beforeEach(() => {
  localStorage.clear()
  vi.mocked(saveEntry).mockReset().mockResolvedValue()
  vi.mocked(saveMalEntry).mockReset().mockResolvedValue()
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
    vi.mocked(saveEntry).mockImplementation(async () => { order.push('anilist') })
    vi.mocked(saveMalEntry).mockImplementation(async () => { order.push('mal') })
    await saveEverywhere(change(1, 2))
    expect(order).toEqual(['anilist', 'mal'])
  })

  it('queues the MAL write when it fails', async () => {
    vi.mocked(saveMalEntry).mockRejectedValue(new Error('offline'))
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
    vi.mocked(saveEntry).mockRejectedValue(new Error('offline'))
    await saveEverywhere(change(1, 2))
    expect(saveMalEntry).toHaveBeenCalled()
    expect(targets()).toEqual([['anilist', 1, 2]])
  })

  it('queues and rethrows when MAL login is revoked', async () => {
    vi.mocked(saveMalEntry).mockRejectedValue(new AuthError('mal'))
    await expect(saveEverywhere(change(1, 2))).rejects.toBeInstanceOf(AuthError)
    expect(targets()).toEqual([['mal', 1, 2]])
  })
})

describe('flushQueue', () => {
  it('sends queued AniList and MAL changes and keeps failed ones', async () => {
    enqueue('anilist', change(1, 2))
    enqueue('mal', change(1, 2))
    enqueue('mal', change(2, 3))
    vi.mocked(saveMalEntry).mockImplementation(async (c) => { if (c.malId === 2) throw new Error('x') })
    await flushQueue()
    expect(saveEntry).toHaveBeenCalledTimes(1)
    expect(targets()).toEqual([['mal', 2, 3]])
  })

  it('keeps MAL changes while MAL is not linked', async () => {
    enqueue('mal', change(1, 2))
    localStorage.removeItem('znz.tokens.mal')
    await flushQueue()
    expect(saveMalEntry).not.toHaveBeenCalled()
    expect(targets()).toEqual([['mal', 1, 2]])
  })

  it('keeps unsent items if the process dies mid-flush', async () => {
    enqueue('mal', change(1, 2))
    enqueue('mal', change(2, 3))
    vi.mocked(saveMalEntry).mockImplementationOnce(async () => {}).mockImplementationOnce(() => new Promise(() => {}))
    void flushQueue()
    await new Promise((r) => setTimeout(r, 0))
    expect(targets()).toEqual([['mal', 2, 3]])
  })
})
