import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeCatalog } from '../src/sources/miruro/decode'
import { miruro } from '../src/sources/miruro'
import { parseEpisodes, parseStreams, pickShow } from '../src/sources/miruro/parse'

afterEach(() => vi.unstubAllGlobals())

function encoded(value: unknown): Response {
  const key = Buffer.from('miruro/catalog')
  const gz = gzipSync(Buffer.from(JSON.stringify(value)))
  const bytes = gz.map((b, i) => b ^ key[i % key.length])
  return new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } })
}

const searchData = { data: [
  { id: 'wrong', external_ids: { anilist: ['1'] } },
  { id: 'o2Eq', external_ids: { anilist: ['154587'], mal: ['52991'] } },
] }

const playData = { episode_number: 1, tracks: [
  { track: 'sub', providers: [
    { provider: 'animepahe', subtitles: [], servers: [{ server: 'animepahe', headers: { Referer: 'https://kwik.cx/' }, streams: [
      { url: 'https://cdn/720.m3u8', format: 'hls', quality: '720p' },
      { url: 'https://cdn/1080.m3u8', format: 'hls', quality: '1080p' },
    ] }] },
    { provider: 'anikoto', subtitles: [{ file: 'https://s/en.vtt', language: 'en', label: 'English', format: 'vtt', default: true }, { file: 'https://s/x.srt', language: 'es', label: 'Spanish', format: 'srt' }],
      skip_times: [{ kind: 'op', start_seconds: 30, end_seconds: 120 }],
      servers: [{ server: 'hd-1', headers: {}, streams: [{ url: 'https://cdn2/master.m3u8', format: 'hls' }] }] },
  ] },
  { track: 'dub', providers: [{ provider: 'kickassanime', subtitles: [], servers: [{ server: 'k', streams: [{ url: 'https://cdn3/d.m3u8', format: 'hls', quality: '1080p' }] }] }] },
] }

describe('decodeCatalog', () => {
  it('decodes XOR and gzip bodies', async () => {
    expect(await decodeCatalog(encoded({ a: 1 }))).toEqual({ a: 1 })
  })

  it('parses plain JSON bodies', async () => {
    expect(await decodeCatalog(Response.json({ b: 2 }))).toEqual({ b: 2 })
  })
})

describe('parse', () => {
  it('picks the result that matches the AniList id', () => {
    expect(pickShow(searchData, 154587)).toBe('o2Eq')
    expect(pickShow(searchData, 999)).toBeNull()
    expect(pickShow({}, 1)).toBeNull()
  })

  it('parses episodes', () => {
    expect(parseEpisodes({ data: [{ episode_number: 1, title: 'Start' }, { episode_number: 2 }] })).toEqual([{ number: 1, title: 'Start' }, { number: 2, title: undefined }])
  })

  it('orders streams by provider then highest quality, keeps vtt subtitles and skip times', () => {
    const streams = parseStreams(playData, 'sub')
    expect(streams.map((s) => s.url)).toEqual(['https://cdn/1080.m3u8', 'https://cdn/720.m3u8', 'https://cdn2/master.m3u8'])
    expect(streams[0].headers).toEqual({ Referer: 'https://kwik.cx/' })
    expect(streams[2].subtitles).toEqual([{ url: 'https://s/en.vtt', lang: 'en', label: 'English', default: true }])
    expect(streams[2].skip).toEqual([{ kind: 'op', start: 30, end: 120 }])
  })

  it('returns dub streams for dub and nothing for a missing track', () => {
    expect(parseStreams(playData, 'dub').map((s) => s.provider)).toEqual(['kickassanime'])
    expect(parseStreams({ tracks: [] }, 'dub')).toEqual([])
  })
})

describe('miruro adapter', () => {
  it('searches each title URL-encoded until the AniList id matches', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(encoded({ data: [] }))
      .mockResolvedValueOnce(encoded(searchData))
    vi.stubGlobal('fetch', fetchMock)
    const show = await miruro.resolve({ anilistId: 154587, titles: ['Re:ZERO & Frieren?', 'Sousou no Frieren'] })
    expect(show).toEqual({ source: 'miruro', id: 'o2Eq' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://www.miruro.to/api/v1/anime?q=Re%3AZERO%20%26%20Frieren%3F&limit=5&sort=-popularity')
  })

  it('returns null when no title matches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => encoded({ data: [] })))
    expect(await miruro.resolve({ anilistId: 1, titles: ['a', 'b'] })).toBeNull()
  })

  it('loads streams for an episode', async () => {
    const fetchMock = vi.fn(async () => encoded(playData))
    vi.stubGlobal('fetch', fetchMock)
    const streams = await miruro.stream({ source: 'miruro', id: 'o2Eq' }, 3, 'sub')
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('https://www.miruro.to/api/v1/anime/o2Eq/episodes/3/play')
    expect(streams).toHaveLength(3)
  })
})
