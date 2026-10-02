import { describe, expect, it } from 'vitest'
import { distinct, favoriteGenres } from '../src/home'
import type { Card } from '../src/types'

const card = (id: number): Card => ({ id, title: `#${id}`, titles: [], cover: '' })

describe('favoriteGenres', () => {
  it('ranks genres by how often they show up, favoring recent shows', () => {
    const genres = { 1: ['Romance', 'Drama'], 2: ['Action'], 3: ['Action'], 4: ['Romance'] }
    expect(favoriteGenres([1, 2, 3, 4], genres)).toEqual(['Romance', 'Action'])
    expect(favoriteGenres([2, 3, 1, 4], genres, 1)).toEqual(['Action'])
  })

  it('returns nothing without data', () => {
    expect(favoriteGenres([], {})).toEqual([])
  })
})

describe('distinct', () => {
  it('drops cards shown in an earlier row or excluded', () => {
    expect(distinct([[card(1), card(2)], [card(2), card(3), card(4)]], new Set([4])).map((r) => r.map((c) => c.id))).toEqual([[1, 2], [3]])
  })

  it('caps each row', () => {
    expect(distinct([[card(1), card(2), card(3)]], new Set(), 2)[0]).toHaveLength(2)
  })
})
