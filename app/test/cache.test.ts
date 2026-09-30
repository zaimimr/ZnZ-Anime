import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cached } from '../src/cache'

beforeEach(() => localStorage.clear())

describe('cached', () => {
  it('reuses fresh values and reloads stale ones', async () => {
    const load = vi.fn().mockResolvedValueOnce([1]).mockResolvedValueOnce([2])
    expect(await cached('k', 1000, load)).toEqual([1])
    expect(await cached('k', 1000, load)).toEqual([1])
    const stored = JSON.parse(localStorage.getItem('znz.cache.k')!)
    localStorage.setItem('znz.cache.k', JSON.stringify({ ...stored, at: Date.now() - 2000 }))
    expect(await cached('k', 1000, load)).toEqual([2])
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('ignores corrupt entries', async () => {
    localStorage.setItem('znz.cache.k', '{nope')
    expect(await cached('k', 1000, async () => 'fresh')).toBe('fresh')
  })
})
