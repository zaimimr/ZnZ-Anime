import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/anilist/api', () => ({ saveEntry: vi.fn(async () => {}) }))
vi.mock('../src/mal/api', () => ({ saveMalEntry: vi.fn(async () => {}) }))

import { saveEntry } from '../src/anilist/api'
import { setToken } from '../src/auth/tokens'
import { saveMalEntry } from '../src/mal/api'
import { enqueue, readQueue } from '../src/sync/queue'
import { flushQueue, saveEverywhere } from '../src/sync/writer'

const change = (malId: number, progress: number) => ({ anilistId: malId + 1, malId, status: 'watching' as const, progress, score: 0 })

beforeEach(() => {
  localStorage.clear()
  vi.mocked(saveEntry).mockReset().mockResolvedValue()
  vi.mocked(saveMalEntry).mockReset().mockResolvedValue()
  setToken('mal', { accessToken: 'M', expiresAt: Date.now() + 1e9 })
})

describe('queue', () => {
  it('keeps only the latest change per anime', () => {
    enqueue(change(1, 3))
    enqueue(change(2, 1))
    enqueue(change(1, 4))
    expect(readQueue().map((c) => [c.malId, c.progress])).toEqual([[2, 1], [1, 4]])
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
    expect(readQueue()).toEqual([change(1, 2)])
  })

  it('skips MAL when there is no MAL id or no MAL login', async () => {
    await saveEverywhere({ anilistId: 5, status: 'watching', progress: 1, score: 0 })
    localStorage.removeItem('znz.tokens.mal')
    await saveEverywhere(change(1, 2))
    expect(saveMalEntry).not.toHaveBeenCalled()
  })

  it('does not write MAL when AniList fails', async () => {
    vi.mocked(saveEntry).mockRejectedValue(new Error('down'))
    await expect(saveEverywhere(change(1, 2))).rejects.toThrow('down')
    expect(saveMalEntry).not.toHaveBeenCalled()
  })
})

describe('flushQueue', () => {
  it('removes sent items and keeps failed ones', async () => {
    enqueue(change(1, 2))
    enqueue(change(2, 3))
    vi.mocked(saveMalEntry).mockImplementation(async (c) => { if (c.malId === 2) throw new Error('x') })
    await flushQueue()
    expect(readQueue().map((c) => c.malId)).toEqual([2])
  })

  it('keeps unsent items if the process dies mid-flush', async () => {
    enqueue(change(1, 2))
    enqueue(change(2, 3))
    vi.mocked(saveMalEntry).mockImplementationOnce(async () => {}).mockImplementationOnce(() => new Promise(() => {}))
    void flushQueue()
    await new Promise((r) => setTimeout(r, 0))
    expect(readQueue().map((c) => c.malId)).toEqual([2])
  })
})
