import { afterEach, describe, expect, it, vi } from 'vitest'
import { justanime } from '../src/sources/justanime'
import { availableServers, parseEpisodes, parseServer } from '../src/sources/justanime/parse'

afterEach(() => vi.unstubAllGlobals())

const show = { source: 'justanime', id: '154587' }

const momo = {
  sub: {
    sources: [{ url: 'https://cdn/master.m3u8', quality: 'auto', isM3U8: true }],
    subtitles: [{ file: 'https://s/ara.vtt', label: 'Arabic', kind: 'captions' }, { file: 'https://s/eng.vtt', label: 'English', kind: 'captions', default: true }],
    intro: { start: 0, end: 89 },
    outro: { start: 1460, end: 1549 },
    headers: { Referer: 'https://megaplay.buzz/' },
  },
  dub: { sources: [{ url: 'https://cdn/dub.m3u8', isM3U8: true }], subtitles: [], headers: {} },
}

const gigi = {
  sub: {
    sources: [
      { url: 'https://g/360.mp4', quality: '360p', isM3U8: false, headers: { Referer: 'https://www.animegg.org/' } },
      { url: 'https://g/1080.mp4', quality: '1080p', isM3U8: false, headers: { Referer: 'https://www.animegg.org/' } },
    ],
    tracks: [],
    intro: null,
    outro: null,
  },
}

describe('parse', () => {
  it('lists episodes that have aired', () => {
    const pages = [{ episodes: [{ number: 1, title: 'Start', image: 'https://i/1.jpg', description: 'Hi', airDate: '2023-09-29' }] }, { episodes: [{ number: 2, airDate: '2099-01-01' }, { number: 'x' }] }]
    expect(parseEpisodes(pages, Date.parse('2026-01-01'))).toEqual([{ number: 1, title: 'Start', synopsis: 'Hi', thumbnail: 'https://i/1.jpg' }])
  })

  it('orders servers that have the wanted language', () => {
    const data = { servers: { gigi: { sub: true, dub: true }, momo: { sub: true, dub: false }, susi: { sub: false, dub: false }, newone: { sub: true }, zone: { sub: true, dub: true }, revo: { sub: true, dub: true } } }
    expect(availableServers(data, 'sub')).toEqual(['momo', 'gigi', 'newone'])
    expect(availableServers(data, 'dub')).toEqual(['gigi'])
    expect(availableServers({}, 'sub')).toEqual([])
  })

  it('reads stream, headers, subtitles and skip times', () => {
    expect(parseServer('momo', momo, 'sub')).toEqual([{
      provider: 'momo',
      url: 'https://cdn/master.m3u8',
      format: 'hls',
      headers: { Referer: 'https://megaplay.buzz/' },
      subtitles: [{ url: 'https://s/ara.vtt', lang: 'und', label: 'Arabic' }, { url: 'https://s/eng.vtt', lang: 'en', label: 'English', default: true }],
      skip: [{ kind: 'op', start: 0, end: 89 }, { kind: 'ed', start: 1460, end: 1549 }],
    }])
    expect(parseServer('momo', momo, 'dub')).toEqual([{ provider: 'momo', url: 'https://cdn/dub.m3u8', format: 'hls', subtitles: [] }])
  })

  it('reads mp4 sources with their own headers, best quality first', () => {
    const streams = parseServer('gigi', gigi, 'sub')
    expect(streams.map((s) => [s.url, s.format, s.quality])).toEqual([['https://g/1080.mp4', 'mp4', '1080p'], ['https://g/360.mp4', 'mp4', '360p']])
    expect(streams[0].headers).toEqual({ Referer: 'https://www.animegg.org/' })
    expect(parseServer('gigi', gigi, 'dub')).toEqual([])
  })
})

describe('justanime adapter', () => {
  it('uses the AniList id and calls the API through the server', async () => {
    expect(await justanime.resolve({ anilistId: 154587, titles: [] })).toEqual(show)
    expect(justanime.defaultHost).toBe('https://auth.test/justanime')
  })

  it('loads every episode page', async () => {
    const fetchMock = vi.fn(async (url: string) => Response.json(url.endsWith('page=1') ? { totalPages: 2, episodes: [{ number: 1 }] } : { totalPages: 2, episodes: [{ number: 2 }] }))
    vi.stubGlobal('fetch', fetchMock)
    expect((await justanime.episodes(show)).map((e) => e.number)).toEqual([1, 2])
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['https://auth.test/justanime/anime/154587/episodes?page=1', 'https://auth.test/justanime/anime/154587/episodes?page=2'])
  })

  it('has no episodes for an unknown anime', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Anime not found' }, { status: 404 })))
    expect(await justanime.episodes({ source: 'justanime', id: '1' })).toEqual([])
  })

  it('collects streams from every server and skips servers that fail', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/servers')) return Response.json({ servers: { gigi: { sub: true }, momo: { sub: true }, zoko: { sub: true } } })
      if (url.endsWith('/momo')) return Response.json(momo)
      if (url.endsWith('/gigi')) return Response.json(gigi)
      return Response.json({ error: 'bad' }, { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const streams = await justanime.stream(show, 3, 'sub')
    expect(streams.map((s) => s.provider)).toEqual(['momo', 'gigi', 'gigi'])
    expect(fetchMock.mock.calls[0][0]).toBe('https://auth.test/justanime/watch/154587/episode/3/servers')
  })
})
