import { type TrendItem, trendingWithHistory } from '../anilist/api'
import { cached } from '../cache'
import type { Card } from '../types'
import { rankTrends } from './rank'

export type TrendWindow = 'day' | 'week' | 'month'

const days: Record<TrendWindow, number> = { day: 1, week: 7, month: 30 }
const POOL_PAGES = 3

let inflight: Promise<TrendItem[]> | null = null

function trendPool(): Promise<TrendItem[]> {
  inflight ??= cached('trending.pool', 3_600_000, async () => {
    const items: TrendItem[] = []
    for (let page = 1; page <= POOL_PAGES; page++) {
      const result = await trendingWithHistory(page)
      items.push(...result.items)
      if (!result.hasNext) break
    }
    return items
  }).finally(() => {
    inflight = null
  })
  return inflight
}

export async function topTrending(window: TrendWindow): Promise<Card[]> {
  const items = await trendPool()
  const since = Math.floor(Date.now() / 1000) - days[window] * 86400
  const cards = new Map(items.map((item) => [item.card.id, item.card]))
  const rows = items.flatMap((item) => item.history.filter((d) => d.date >= since).map((d) => ({ mediaId: item.card.id, trending: d.trending })))
  return rankTrends(rows, 30).map((id) => cards.get(id)!)
}
