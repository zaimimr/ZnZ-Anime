import { afterEach, describe, expect, it, vi } from 'vitest'
import { animex } from '../src/sources/animex'
import { parseEpisodes, parseSources, providerIds } from '../src/sources/animex/parse'

afterEach(() => vi.unstubAllGlobals())

const show = { source: 'animex', id: 'frieren-faato' }

const yuki = {
  sources: [{ url: 'https://cdn/master.m3u8', quality: 'auto', type: 'video/mpegurl' }],
  tracks: [
    { url: 'https://s/eng.vtt', lang: 'english', label: 'English', kind: 'captions', default: true },
    { url: 'https://s/pt.vtt', lang: 'portuguese', label: 'Portuguese (- Portuguese(Brazil))', kind: 'captions' },
    { url: 'https://s/eng2.vtt', lang: 'en', label: 'English', kind: 'captions' },
    { url: 'https://s/thumbs.vtt', kind: 'thumbnails' },
  ],
  chapters: [{ title: 'Intro', start: 0, end: 89 }, { title: 'Outro', start: 1460, end: 1549 }, { title: 'Recap', start: 90, end: 120 }],
  headers: { Origin: 'https://megaplay.buzz', Referer: 'https://megaplay.buzz/' },
}

describe('parse', () => {
  it('lists aired episodes with English titles, pictures, length and filler', () => {
    const data = [
      { number: 1, titles: { en: 'Start', ja: 'x' }, img: 'https://i/1.jpg', description: 'Hi', length: 24, isFiller: false, airDateUtc: '2023-09-29T14:00:00Z' },
      { number: 2, titles: { 'x-jat': 'Romaji' }, isFiller: true },
      { number: 3, airDateUtc: '2099-01-01T00:00:00Z' },
    ]
    expect(parseEpisodes(data, Date.parse('2026-01-01'))).toEqual([
      { number: 1, title: 'Start', synopsis: 'Hi', thumbnail: 'https://i/1.jpg', duration: 1440 },
      { number: 2, title: 'Romaji', filler: 'filler' },
    ])
    expect(parseEpisodes({})).toEqual([])
  })

  it('reads the providers for the wanted language', () => {
    const data = { subProviders: [{ id: 'yuki' }, { id: 'sora' }], dubProviders: [{ id: 'sora' }] }
    expect(providerIds(data, 'sub')).toEqual(['yuki', 'sora'])
    expect(providerIds(data, 'dub')).toEqual(['sora'])
    expect(providerIds({}, 'dub')).toEqual([])
  })

  it('reads stream, headers, unique subtitles and intro and outro', () => {
    expect(parseSources('yuki', yuki)).toEqual([{
      provider: 'yuki',
      url: 'https://cdn/master.m3u8',
      format: 'hls',
      headers: { Origin: 'https://megaplay.buzz', Referer: 'https://megaplay.buzz/' },
      subtitles: [{ url: 'https://s/eng.vtt', lang: 'english', label: 'English', default: true }, { url: 'https://s/pt.vtt', lang: 'portuguese', label: 'Portuguese (Brazil)' }],
      skip: [{ kind: 'op', start: 0, end: 89 }, { kind: 'ed', start: 1460, end: 1549 }],
    }])
    expect(parseSources('sora', {})).toEqual([])
  })
})

describe('animex adapter', () => {
  it('finds the show by AniList id through the server', async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: { anime: { id: 'frieren-faato' } } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await animex.resolve({ anilistId: 154587, titles: [] })).toEqual(show)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://auth.test/animex/graphql')
    expect(JSON.parse(String(init.body)).variables).toEqual({ anilistId: 154587 })
  })

  it('returns null when the show is unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { anime: null } })))
    expect(await animex.resolve({ anilistId: 1, titles: [] })).toBeNull()
  })

  it('collects streams from every provider and skips providers that fail', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/servers?')) return Response.json({ subProviders: [{ id: 'yuki' }, { id: 'sora' }] })
      if (url.includes('providerId=yuki')) return Response.json(yuki)
      return Response.json({ error: 'bad' }, { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const streams = await animex.stream(show, 3, 'sub')
    expect(streams.map((s) => s.provider)).toEqual(['yuki'])
    expect(fetchMock.mock.calls[0][0]).toBe('https://auth.test/animex/servers?id=frieren-faato&epNum=3')
    expect(fetchMock.mock.calls[1][0]).toBe('https://auth.test/animex/sources?id=frieren-faato&epNum=3&type=sub&providerId=yuki')
  })
})
