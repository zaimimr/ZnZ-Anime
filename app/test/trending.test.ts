import { beforeEach, describe, expect, it, vi } from 'vitest'

const card = (id: number) => ({ id, title: `t${id}`, titles: [], cover: '' })

vi.mock('../src/anilist/api', () => ({
  trendingWithHistory: vi.fn(async (page: number) => ({
    items: page === 1
      ? [
          { card: card(1), history: [{ date: 900_000, trending: 5 }, { date: 100, trending: 1000 }] },
          { card: card(2), history: [{ date: 900_000, trending: 9 }] },
        ]
      : [{ card: card(3), history: [{ date: 800_000, trending: 20 }] }, { card: card(1), history: [{ date: 900_000, trending: 100 }] }],
    hasNext: page < 2,
  })),
}))

import { trendingWithHistory } from '../src/anilist/api'
import { rankTrends } from '../src/trending/rank'
import { topTrending } from '../src/trending'

beforeEach(() => { localStorage.clear(); vi.mocked(trendingWithHistory).mockClear() })

describe('rankTrends', () => {
  it('sums trending per anime and sorts descending', () => {
    expect(rankTrends([{ mediaId: 1, trending: 5 }, { mediaId: 2, trending: 9 }, { mediaId: 1, trending: 6 }])).toEqual([1, 2])
  })

  it('caps the list', () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ mediaId: i, trending: i }))
    expect(rankTrends(rows, 50)).toHaveLength(50)
  })
})

describe('topTrending', () => {
  it('only counts trend days inside the window and stops when there are no more pages', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10 * 86400 * 1000)
    const cards = await topTrending('week')
    expect(trendingWithHistory).toHaveBeenCalledTimes(2)
    expect(cards.map((c) => c.id)).toEqual([3, 2, 1])
  })

  it('fetches once and serves every window from the same data', async () => {
    await topTrending('day')
    await topTrending('week')
    await topTrending('month')
    await topTrending('day')
    expect(trendingWithHistory).toHaveBeenCalledTimes(2)
  })

  it('shares one fetch between windows requested at the same time', async () => {
    await Promise.all([topTrending('day'), topTrending('week'), topTrending('month')])
    expect(trendingWithHistory).toHaveBeenCalledTimes(2)
  })
})
