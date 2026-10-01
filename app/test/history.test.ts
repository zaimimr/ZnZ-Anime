import { beforeEach, describe, expect, it } from 'vitest'
import { continueWatching, readHistory, recordPlay } from '../src/history'
import type { ListItem } from '../src/types'

beforeEach(() => localStorage.clear())

const item = (id: number, status: ListItem['entry']['status'], updatedAt = 0): ListItem => ({
  entry: { anilistId: id, title: `A${id}`, status, progress: 0, score: 0 },
  card: { id, title: `A${id}`, titles: [], cover: '', episodes: 12 },
  updatedAt,
})

describe('history', () => {
  it('keeps one entry per show, newest first', () => {
    recordPlay(1, 3, false)
    recordPlay(2, 1, false)
    recordPlay(1, 4, true)
    expect(readHistory().map((h) => [h.id, h.ep, h.done])).toEqual([[1, 4, true], [2, 1, false]])
  })

  it('orders continue watching by what was played last', () => {
    const list = [item(1, 'watching', 500), item(2, 'watching', 100), item(3, 'planning'), item(4, 'completed')]
    const history = [{ id: 3, ep: 1, at: 900, done: false }, { id: 2, ep: 5, at: 800, done: false }]
    expect(continueWatching(list, history).map((i) => i.card.id)).toEqual([3, 2, 1])
  })

  it('shows unplayed rewatches like watching ones', () => {
    const list = [item(1, 'rewatching', 500), item(2, 'watching', 100), item(3, 'completed')]
    expect(continueWatching(list, []).map((i) => i.card.id)).toEqual([1, 2])
  })

  it('adds shows played without being on the list and drops finished ones', () => {
    const list = [item(1, 'watching', 500)]
    const history = [{ id: 1, ep: 12, at: 900, done: true }, { id: 9, ep: 2, at: 800, done: false }]
    expect(continueWatching(list, history, [item(9, 'watching')]).map((i) => i.card.id)).toEqual([9])
  })
})
