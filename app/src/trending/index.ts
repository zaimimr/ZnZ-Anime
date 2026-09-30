import { trendingWithHistory } from '../anilist/api'
import { cached } from '../cache'
import type { Card } from '../types'
import { rankTrends } from './rank'

export type TrendWindow = 'day' | 'week' | 'month'

const windows: Record<TrendWindow, { days: number; pages: number }> = {
  day: { days: 1, pages: 1 },
  week: { days: 7, pages: 2 },
  month: { days: 30, pages: 3 },
}

export function topTrending(window: TrendWindow): Promise<Card[]> {
  return cached(`trending.${window}`, 3_600_000, async () => {
    const { days, pages } = windows[window]
    const since = Math.floor(Date.now() / 1000) - days * 86400
    const cards = new Map<number, Card>()
    const rows: { mediaId: number; trending: number }[] = []
    for (let page = 1; page <= pages; page++) {
      const result = await trendingWithHistory(page)
      for (const item of result.items) {
        cards.set(item.card.id, item.card)
        for (const day of item.history) if (day.date >= since) rows.push({ mediaId: item.card.id, trending: day.trending })
      }
      if (!result.hasNext) break
    }
    return rankTrends(rows).map((id) => cards.get(id)!)
  })
}
