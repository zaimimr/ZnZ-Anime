import type { SkipRange, Stream } from '../sources/types'
import type { Status } from '../types'

export function shouldMarkWatched(position: number, duration: number): boolean {
  return duration > 0 && position / duration >= 0.85
}

export function activeSkip(ranges: SkipRange[] | undefined, position: number): SkipRange | null {
  return ranges?.find((r) => position >= r.start && position < r.end) ?? null
}

export function countdownAt(ranges: SkipRange[] | undefined, duration: number): number | null {
  const ed = ranges?.find((r) => r.kind === 'ed')
  if (!ed || !(duration > 0)) return null
  return duration - ed.end > 15 ? ed.end : ed.start
}

export function playTarget(watched: number, available: number | undefined, total: number | undefined): number {
  if (available === undefined || watched < available) return watched + 1
  return total !== undefined && watched >= total ? 1 : Math.max(available, 1)
}

export function statusAfter(ep: number, total: number | undefined): Status {
  return total !== undefined && ep >= total ? 'completed' : 'watching'
}

export function nextStreamIndex(streams: Stream[], current: number, skipProvider = false): number {
  const blocked = skipProvider ? streams[current]?.provider : undefined
  for (let i = current + 1; i < streams.length; i++) {
    if (streams[i].provider !== blocked) return i
  }
  return -1
}

export function shouldSaveResume(el: { currentTime: number; ended: boolean }): boolean {
  return el.currentTime > 0 && !el.ended
}
