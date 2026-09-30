import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/anilist/api', () => ({
  fetchList: vi.fn(async () => [{ entry: { anilistId: 1, malId: 101, title: 'A', status: 'watching', progress: 1, score: 0 }, card: {}, updatedAt: 0 }]),
  anilistIdsForMal: vi.fn(async () => new Map([[102, 2]])),
  saveEntry: vi.fn(async () => {}),
}))
vi.mock('../src/mal/api', () => ({
  fetchMalList: vi.fn(async () => [
    { malId: 101, title: 'A', status: 'watching', progress: 4, score: 0 },
    { malId: 102, title: 'B', status: 'completed', progress: 12, score: 8 },
  ]),
  saveMalEntry: vi.fn(async () => {}),
}))

import { anilistIdsForMal, saveEntry } from '../src/anilist/api'
import { saveMalEntry } from '../src/mal/api'
import { applyMerge, isMerged, prepareMerge, readUnmatched } from '../src/sync/job'

beforeEach(() => localStorage.clear())

describe('merge job', () => {
  it('looks up only MAL-only ids and plans writes', async () => {
    const plan = await prepareMerge()
    expect(anilistIdsForMal).toHaveBeenCalledWith([102])
    expect(plan.toAnilist.map((c) => c.anilistId)).toEqual([1, 2])
    expect(plan.toMal).toEqual([])
  })

  it('applies writes, reports progress, and stores the result', async () => {
    const plan = await prepareMerge()
    const progress: number[] = []
    await applyMerge({ ...plan, unmatched: [{ title: 'X', status: 'watching', progress: 0, score: 0 }] }, (done) => progress.push(done), 0)
    expect(saveEntry).toHaveBeenCalledTimes(2)
    expect(saveMalEntry).not.toHaveBeenCalled()
    expect(progress).toEqual([1, 2])
    expect(isMerged()).toBe(true)
    expect(readUnmatched().map((u) => u.title)).toEqual(['X'])
  })
})
