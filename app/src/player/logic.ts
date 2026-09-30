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

export interface Section { kind: 'main' | 'op' | 'ed'; start: number; end: number }

export function sections(ranges: SkipRange[] | undefined, duration: number): Section[] {
  if (!(duration > 0)) return []
  const result: Section[] = []
  let cursor = 0
  for (const r of [...(ranges ?? [])].sort((a, b) => a.start - b.start)) {
    const start = Math.max(r.start, cursor)
    const end = Math.min(r.end, duration)
    if (end - start < 1) continue
    if (start - cursor >= 1) result.push({ kind: 'main', start: cursor, end: start })
    else if (result.length) result[result.length - 1].end = start
    result.push({ kind: r.kind, start: result.length ? start : 0, end })
    cursor = end
  }
  if (duration - cursor >= 1) result.push({ kind: 'main', start: cursor, end: duration })
  else if (result.length) result[result.length - 1].end = duration
  return result
}

export function providers(streams: Stream[]): string[] {
  return [...new Set(streams.map((s) => s.provider))]
}

export function qualityLabel(quality: string | undefined): { label: string; detail: string } {
  const p = Number(quality?.match(/\d+/)?.[0] ?? 0)
  if (!p) return { label: 'Automatic', detail: 'Adjusts to your connection' }
  if (p >= 1080) return { label: `${p}p`, detail: 'Sharpest picture' }
  if (p >= 720) return { label: `${p}p`, detail: 'Sharp, uses less data' }
  if (p >= 480) return { label: `${p}p`, detail: 'Standard picture' }
  return { label: `${p}p`, detail: 'Lowest data use' }
}

export function scrubStep(holdCount: number): number {
  if (holdCount < 6) return 10
  if (holdCount < 16) return 30
  return 60
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
