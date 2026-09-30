import { describe, expect, it } from 'vitest'
import { dayName, newEpisodes, progressLabel } from '../src/list'
import type { ListItem } from '../src/types'

const item = (progress: number, extra: Partial<ListItem> = {}, status: ListItem['entry']['status'] = 'watching'): ListItem => ({
  entry: { anilistId: 1, title: 'A', status, progress, score: 0 },
  card: { id: 1, title: 'A', titles: ['A'], cover: '', episodes: 12 },
  updatedAt: 0,
  ...extra,
})

describe('list', () => {
  const soon = Date.now() + 86_400_000
  it('finds watching shows with aired episodes not yet seen', () => {
    const items = [item(3, { aired: 5, nextAiring: { episode: 6, at: soon } }), item(5, { aired: 5, nextAiring: { episode: 6, at: soon } }), item(2, { aired: 12 })]
    expect(newEpisodes(items)).toHaveLength(1)
  })

  it('describes progress in plain words', () => {
    expect(progressLabel(item(3, { aired: 5, nextAiring: { episode: 6, at: soon } }))).toBe('2 new')
    expect(progressLabel(item(5, { aired: 5, nextAiring: { episode: 6, at: soon } }))).toMatch(/^Episode 6 Tomorrow \d\d:\d\d$/)
    expect(progressLabel(item(4))).toBe('Watched 4 of 12')
    expect(progressLabel(item(0, {}, 'planning'))).toBe('12 episodes')
    expect(progressLabel(item(12, {}, 'completed'))).toBe('12 episodes')
  })

  it('names days relative to now', () => {
    const now = new Date(2026, 8, 30, 12).getTime()
    expect(dayName(new Date(2026, 8, 30, 20).getTime(), now)).toBe('Today')
    expect(dayName(new Date(2026, 9, 1, 1).getTime(), now)).toBe('Tomorrow')
    expect(dayName(new Date(2026, 9, 3, 1).getTime(), now)).toBe('Saturday')
  })
})
