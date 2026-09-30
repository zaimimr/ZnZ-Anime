import { describe, expect, it } from 'vitest'
import { adapters } from './registry'

const frieren = { anilistId: 154587, titles: ['Sousou no Frieren', "Frieren: Beyond Journey's End"] }

describe.each(Object.values(adapters))('$id', (adapter) => {
  it('resolves, lists episodes and serves a playable stream', async () => {
    const show = await adapter.resolve(frieren)
    expect(show, 'resolve').not.toBeNull()
    const episodes = await adapter.episodes(show!)
    expect(episodes.length, 'episodes').toBeGreaterThanOrEqual(28)
    const streams = await adapter.stream(show!, 1, 'sub')
    expect(streams.length, 'streams').toBeGreaterThan(0)
    const hls = streams.find((s) => s.format === 'hls')!
    const res = await fetch(hls.url, { headers: hls.headers })
    expect(res.status, `playlist ${hls.provider}`).toBe(200)
    expect((await res.text()).startsWith('#EXTM3U')).toBe(true)
  })
})
