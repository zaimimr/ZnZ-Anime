import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aniskip, mergeSkips } from '../src/aniskip'
import { b64urlDecode } from '../src/b64'
import { activeSkip, countdownAt, cycle, nextStreamIndex, playTarget, sections, shouldMarkWatched, shouldSaveResume, statusAfter } from '../src/player/logic'
import { playableUrl } from '../src/player/proxy'
import { clearResume, getResume, setResume } from '../src/player/resume'

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
    const ed = (end: number) => [{ kind: 'op' as const, start: 0, end: 90 }, { kind: 'ed' as const, start: 1370, end }]
    expect(countdownAt(ed(1460), 1470)).toBe(1370)
    expect(countdownAt(ed(1400), 1470)).toBe(1400)
    expect(countdownAt([{ kind: 'op', start: 0, end: 90 }], 1470)).toBeNull()
    expect(countdownAt(ed(1460), Number.NaN)).toBeNull()
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

  it('reads op and ed times', async () => {
    const fetchMock = vi.fn(async () => Response.json({ results: [{ skipType: 'op', interval: { startTime: 1.5, endTime: 91.5 } }, { skipType: 'recap', interval: { startTime: 0, endTime: 1 } }] }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await aniskip(52991, 4)).toEqual([{ kind: 'op', start: 1.5, end: 91.5 }])
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('https://api.aniskip.com/v2/skip-times/52991/4?types=op&types=ed&episodeLength=0')
  })

  it('fills only the kinds the source is missing', () => {
    const op = { kind: 'op' as const, start: 1, end: 91 }
    const ed = { kind: 'ed' as const, start: 1370, end: 1460 }
    expect(mergeSkips([op], [{ ...op, start: 5 }, ed])).toEqual([op, ed])
    expect(mergeSkips(undefined, [ed])).toEqual([ed])
    expect(mergeSkips(undefined, [])).toBeUndefined()
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

  it('cycles through options', () => {
    expect(cycle(['a', 'b', 'c'], 'c', 1)).toBe('a')
    expect(cycle(['a', 'b', 'c'], 'a', -1)).toBe('c')
  })
})
