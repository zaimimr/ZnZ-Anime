import type { SkipRange } from '../sources/types'
import type { Status } from '../types'

export function shouldMarkWatched(position: number, duration: number): boolean {
  return duration > 0 && position / duration >= 0.85
}

export function activeSkip(ranges: SkipRange[] | undefined, position: number): SkipRange | null {
  return ranges?.find((r) => position >= r.start && position < r.end) ?? null
}

export function statusAfter(ep: number, total: number | undefined): Status {
  return total !== undefined && ep >= total ? 'completed' : 'watching'
}
