import { describe, expect, it } from 'vitest'
import { mergeEntry, planMerge } from '../src/sync/merge'
import type { ListEntry, Status } from '../src/types'

const e = (status: Status, progress: number, score: number, ids: Partial<ListEntry> = {}): ListEntry => ({ title: 't', status, progress, score, ...ids })

describe('mergeEntry', () => {
  it.each([
    ['completed', 'watching', 'completed'],
    ['watching', 'completed', 'completed'],
    ['watching', 'paused', 'watching'],
    ['paused', 'planning', 'paused'],
    ['planning', 'dropped', 'planning'],
    ['dropped', 'watching', 'watching'],
    ['dropped', 'dropped', 'dropped'],
  ] as [Status, Status, Status][])('AniList %s + MAL %s = %s', (a, m, expected) => {
    expect(mergeEntry(e(a, 0, 0), e(m, 0, 0)).status).toBe(expected)
  })

  it('takes the higher progress', () => {
    expect(mergeEntry(e('watching', 3, 0), e('watching', 7, 0)).progress).toBe(7)
    expect(mergeEntry(e('watching', 9, 0), e('watching', 7, 0)).progress).toBe(9)
  })

  it('prefers the AniList score unless it is 0', () => {
    expect(mergeEntry(e('watching', 0, 8), e('watching', 0, 6)).score).toBe(8)
    expect(mergeEntry(e('watching', 0, 0), e('watching', 0, 6)).score).toBe(6)
  })

  it('uses the only side present', () => {
    expect(mergeEntry(undefined, e('paused', 2, 5))).toEqual({ status: 'paused', progress: 2, score: 5 })
    expect(mergeEntry(e('paused', 2, 5), undefined)).toEqual({ status: 'paused', progress: 2, score: 5 })
  })
})

describe('planMerge', () => {
  it('builds writes for both sides and skips entries already equal', () => {
    const anilist = [
      e('watching', 3, 8, { anilistId: 1, malId: 101 }),
      e('completed', 12, 9, { anilistId: 2, malId: 102 }),
      e('planning', 0, 0, { anilistId: 3, malId: 103 }),
    ]
    const mal = [
      e('watching', 5, 0, { malId: 101 }),
      e('completed', 12, 9, { malId: 102 }),
    ]
    const plan = planMerge(anilist, mal, new Map())
    expect(plan.toAnilist).toEqual([{ anilistId: 1, malId: 101, title: 't', status: 'watching', progress: 5, score: 8 }])
    expect(plan.toMal).toEqual([
      { anilistId: 1, malId: 101, title: 't', status: 'watching', progress: 5, score: 8 },
      { anilistId: 3, malId: 103, title: 't', status: 'planning', progress: 0, score: 0 },
    ])
    expect(plan.unmatched).toEqual([])
  })

  it('adds MAL-only entries to AniList when the id maps, else reports them', () => {
    const mal = [e('completed', 24, 7, { malId: 200 }), e('watching', 1, 0, { malId: 201 })]
    const plan = planMerge([], mal, new Map([[200, 20]]))
    expect(plan.toAnilist).toEqual([{ anilistId: 20, malId: 200, title: 't', status: 'completed', progress: 24, score: 7 }])
    expect(plan.unmatched).toEqual([mal[1]])
  })

  it('reports AniList entries without a MAL id', () => {
    const lonely = e('watching', 2, 0, { anilistId: 9 })
    expect(planMerge([lonely], [], new Map()).unmatched).toEqual([lonely])
  })
})
