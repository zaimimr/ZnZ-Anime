import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveSettings } from '../src/settings'
import { adapters, resolveFirst, streamsWithFallback } from '../src/sources/registry'
import type { SourceAdapter } from '../src/sources/types'

const fake = (id: string, found: boolean): SourceAdapter => ({
  id,
  resolve: vi.fn(async () => (found ? { source: id, id: `${id}-show` } : null)),
  episodes: vi.fn(async () => [{ number: 1 }]),
  stream: vi.fn(async () => []),
})

beforeEach(() => {
  localStorage.clear()
  adapters.miruro = fake('miruro', false)
  adapters.a = fake('a', false)
  adapters.b = fake('b', true)
  saveSettings({ sourceOrder: ['a', 'b'], lang: 'sub' })
})

describe('resolveFirst', () => {
  it('uses the first adapter in settings order that finds the anime', async () => {
    const result = await resolveFirst({ anilistId: 1, titles: ['x'] })
    expect(result?.adapter.id).toBe('b')
    expect(result?.episodes).toEqual([{ number: 1 }])
  })

  it('skips adapters that throw or are excluded', async () => {
    adapters.a.resolve = vi.fn(async () => { throw new Error('down') })
    expect((await resolveFirst({ anilistId: 1, titles: ['x'] }))?.adapter.id).toBe('b')
    expect(await resolveFirst({ anilistId: 1, titles: ['x'] }, ['b'])).toBeNull()
  })

  it('returns null when no adapter has the anime', async () => {
    adapters.b = fake('b', false)
    expect(await resolveFirst({ anilistId: 1, titles: ['x'] })).toBeNull()
  })

  it('ignores unknown ids in settings', async () => {
    saveSettings({ sourceOrder: ['gone', 'b'], lang: 'sub' })
    expect((await resolveFirst({ anilistId: 1, titles: ['x'] }))?.adapter.id).toBe('b')
  })
})

describe('streamsWithFallback', () => {
  it('falls back to the other language when the requested one is empty', async () => {
    const adapter = fake('b', true)
    adapter.stream = vi.fn(async (_s, _e, lang) => (lang === 'sub' ? [{ provider: 'p', url: 'u', format: 'hls' as const, subtitles: [] }] : []))
    const result = await streamsWithFallback(adapter, { source: 'b', id: 'x' }, 1, 'dub')
    expect(result.lang).toBe('sub')
    expect(result.streams).toHaveLength(1)
  })
})
