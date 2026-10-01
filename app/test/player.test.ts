import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseThumbs, thumbAt } from '../src/player/thumbnails'
import { aniskip, mergeSkips } from '../src/aniskip'
import { b64urlDecode } from '../src/b64'
import { activeSkip, countdownAt, nearEnd, nextEpisode, qualityChoices, nextStreamIndex, playTarget, preferredIndex, qualityLabel, scrubStep, sections, shouldMarkWatched, shouldSaveResume, statusAfter } from '../src/player/logic'
import { playableUrl } from '../src/player/proxy'
import { clearResume, getResume, getServer, setResume, setServer } from '../src/player/resume'

beforeEach(() => localStorage.clear())

describe('player logic', () => {
  it('marks watched from 85%', () => {
    expect(shouldMarkWatched(84, 100)).toBe(false)
    expect(shouldMarkWatched(85, 100)).toBe(true)
    expect(shouldMarkWatched(10, 0)).toBe(false)
    expect(shouldMarkWatched(10, Number.NaN)).toBe(false)
  })

  it('finds the active skip range', () => {
    const ranges = [{ kind: 'op' as const, start: 30, end: 120 }]
    expect(activeSkip(ranges, 29)).toBeNull()
    expect(activeSkip(ranges, 30)?.kind).toBe('op')
    expect(activeSkip(ranges, 120)).toBeNull()
    expect(activeSkip(undefined, 50)).toBeNull()
  })

  it('starts the next episode countdown at the outro unless a scene follows it', () => {
    const ed = (end: number) => [{ kind: 'op' as const, start: 0, end: 90 }, { kind: 'ed' as const, start: 1370, end, verified: true }]
    expect(countdownAt(ed(1460), 1470)).toBe(1370)
    expect(countdownAt([{ kind: 'ed', start: 1370, end: 1460 }], 1470)).toBeNull()
    expect(countdownAt(ed(1400), 1470)).toBeNull()
    expect(countdownAt([{ kind: 'op', start: 0, end: 90 }], 1470)).toBeNull()
    expect(countdownAt(ed(1460), Number.NaN)).toBeNull()
  })

  it('skips filler episodes only when asked', () => {
    const eps = [{ number: 1 }, { number: 2, filler: 'filler' as const }, { number: 3, filler: 'mixed' as const }, { number: 4, filler: 'filler' as const }]
    expect(nextEpisode(eps, 1, 4, false)).toBe(2)
    expect(nextEpisode(eps, 1, 4, true)).toBe(3)
    expect(nextEpisode(eps, 3, 4, true)).toBeNull()
  })

  it('starts on the server used last time', () => {
    const streams = [{ provider: 'a' }, { provider: 'b' }, { provider: 'b' }].map((s) => ({ ...s, url: '', format: 'hls' as const, subtitles: [] }))
    expect(preferredIndex(streams, 'b')).toBe(1)
    expect(preferredIndex(streams, 'z')).toBe(0)
    expect(preferredIndex(streams, null)).toBe(0)
    expect(getServer(5)).toBeNull()
    setServer(5, 'b')
    expect(getServer(5)).toBe('b')
    expect(getServer(6)).toBe('b')
    setServer(6, 'a')
    expect(getServer(5)).toBe('b')
  })

  it('offers a next episode only when the source has it', () => {
    const eps = [{ number: 1 }, { number: 2 }, { number: 3, filler: 'filler' as const }]
    expect(nextEpisode(eps, 2, 24, false)).toBe(3)
    expect(nextEpisode(eps, 3, 24, false)).toBeNull()
    expect(nextEpisode(eps, 2, 24, true)).toBeNull()
  })

  it('picks the episode to play', () => {
    expect(playTarget(3, 28, 28)).toBe(4)
    expect(playTarget(3, undefined, 28)).toBe(4)
    expect(playTarget(28, 28, 28)).toBe(1)
    expect(playTarget(10, 10, undefined)).toBe(10)
    expect(playTarget(0, 0, undefined)).toBe(1)
  })

  it('completes on the last episode', () => {
    expect(statusAfter(12, 12)).toBe('completed')
    expect(statusAfter(11, 12)).toBe('watching')
    expect(statusAfter(5, undefined)).toBe('watching')
  })
})

describe('nextStreamIndex', () => {
  const streams = ['pahe', 'pahe', 'pahe', 'waves', 'kaa'].map((provider) => ({ provider, url: '', format: 'hls' as const, subtitles: [] }))

  it('moves to the next stream', () => {
    expect(nextStreamIndex(streams, 0)).toBe(1)
  })

  it('skips the rest of a blocked provider', () => {
    expect(nextStreamIndex(streams, 0, true)).toBe(3)
  })

  it('returns -1 when nothing is left', () => {
    expect(nextStreamIndex(streams, 4)).toBe(-1)
    expect(nextStreamIndex(streams.slice(0, 3), 0, true)).toBe(-1)
  })
})

describe('shouldSaveResume', () => {
  it('saves while playing and never after the episode ended', () => {
    expect(shouldSaveResume({ currentTime: 300, ended: false })).toBe(true)
    expect(shouldSaveResume({ currentTime: 0, ended: false })).toBe(false)
    expect(shouldSaveResume({ currentTime: 1559, ended: true })).toBe(false)
  })
})

describe('resume', () => {
  it('stores positions per anime and episode', () => {
    setResume(1, 2, 300)
    expect(getResume(1, 2)).toBe(300)
    expect(getResume(1, 3)).toBe(0)
    clearResume(1, 2)
    expect(getResume(1, 2)).toBe(0)
  })
})

describe('playableUrl', () => {
  it('proxies when a referer is required', () => {
    const url = new URL(playableUrl('https://cdn/a.m3u8', { Referer: 'https://kwik.cx/' }))
    expect(url.origin + url.pathname).toBe('https://auth.test/proxy')
    expect(b64urlDecode(url.searchParams.get('u')!)).toBe('https://cdn/a.m3u8')
    expect(b64urlDecode(url.searchParams.get('r')!)).toBe('https://kwik.cx/')
  })

  it('returns the raw URL without headers', () => {
    expect(playableUrl('https://cdn/a.m3u8')).toBe('https://cdn/a.m3u8')
  })
})

describe('aniskip', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads op and ed times for this video length only', async () => {
    const fetchMock = vi.fn(async () => Response.json({ results: [
      { skipType: 'op', interval: { startTime: 1.5, endTime: 91.5 }, episodeLength: 1440.4 },
      { skipType: 'ed', interval: { startTime: 1417, endTime: 1507 }, episodeLength: 1510.1 },
      { skipType: 'recap', interval: { startTime: 0, endTime: 1 }, episodeLength: 1440 },
    ] }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await aniskip(52991, 4, 1441.7)).toEqual([{ kind: 'op', start: 1.5, end: 91.5, verified: true }])
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('https://api.aniskip.com/v2/skip-times/52991/4?types=op&types=ed&episodeLength=1442')
  })

  it('prefers times matched to the video over source times', () => {
    const op = { kind: 'op' as const, start: 1, end: 91 }
    const ed = { kind: 'ed' as const, start: 1370, end: 1460 }
    const matched = { ...op, start: 43, end: 133, verified: true }
    expect(mergeSkips([op, ed], [matched])).toEqual([matched, ed])
    expect(mergeSkips(undefined, [matched])).toEqual([matched])
    expect(mergeSkips(undefined, [])).toBeUndefined()
  })

  it('drops source times that do not fit the video', () => {
    expect(mergeSkips([{ kind: 'ed', start: 1417, end: 1507 }], [], 1440)).toBeUndefined()
  })
})

describe('sections', () => {
  it('splits the bar into intro, episode and outro parts', () => {
    const ranges = [{ kind: 'ed' as const, start: 1370, end: 1460 }, { kind: 'op' as const, start: 0.5, end: 90 }]
    expect(sections(ranges, 1470)).toEqual([
      { kind: 'op', start: 0, end: 90 },
      { kind: 'main', start: 90, end: 1370 },
      { kind: 'ed', start: 1370, end: 1460 },
      { kind: 'main', start: 1460, end: 1470 },
    ])
    expect(sections(undefined, 100)).toEqual([{ kind: 'main', start: 0, end: 100 }])
    expect(sections(ranges, 0)).toEqual([])
  })

  it('offers only real quality steps, not mirror servers', () => {
    expect(qualityChoices([{}, {}, {}])).toEqual([])
    expect(qualityChoices([{ quality: '720p' }, { quality: '1080p' }, { quality: '1080p' }, {}])).toEqual([{ label: '1080p', index: 1 }, { label: '720p', index: 0 }])
  })

  it('treats the last 20 seconds as the end', () => {
    expect(nearEnd(1455, 1470)).toBe(true)
    expect(nearEnd(1400, 1470)).toBe(false)
    expect(nearEnd(10, Number.NaN)).toBe(false)
  })

  it('names quality in plain words', () => {
    expect(qualityLabel('1080p')).toEqual({ label: '1080p', detail: 'Sharpest picture' })
    expect(qualityLabel('360p').detail).toBe('Lowest data use')
    expect(qualityLabel(undefined).label).toBe('Automatic')
  })

  it('scrubs faster the longer a key is held', () => {
    expect(scrubStep(0)).toBe(10)
    expect(scrubStep(8)).toBe(30)
    expect(scrubStep(30)).toBe(60)
  })
})

describe('thumbnails', () => {
  it('parses sprite cues with absolute image URLs', () => {
    const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nsprite-01.jpg#xywh=0,0,320,180\n\n00:00:05.000 --> 00:01:10.000\nsprite-01.jpg#xywh=320,0,320,180\n'
    const cues = parseThumbs(vtt, 'https://cdn.test/a/preview.vtt')
    expect(cues).toEqual([
      { start: 0, end: 5, url: 'https://cdn.test/a/sprite-01.jpg', x: 0, y: 0, w: 320, h: 180 },
      { start: 5, end: 70, url: 'https://cdn.test/a/sprite-01.jpg', x: 320, y: 0, w: 320, h: 180 },
    ])
    expect(thumbAt(cues, 6)?.x).toBe(320)
    expect(thumbAt(cues, 999)?.x).toBe(320)
  })
})
