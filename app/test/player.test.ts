import { beforeEach, describe, expect, it } from 'vitest'
import { b64urlDecode } from '../src/b64'
import { activeSkip, nextStreamIndex, shouldMarkWatched, shouldSaveResume, statusAfter } from '../src/player/logic'
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
