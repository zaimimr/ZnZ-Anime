import { hosts } from './hosts'
import { request } from './http'
import type { SkipRange } from './sources/types'

const LENGTH_TOLERANCE = 3

export async function aniskip(malId: number, ep: number, duration: number): Promise<SkipRange[]> {
  const res = await request(`${hosts.aniskip}/v2/skip-times/${malId}/${ep}?types=op&types=ed&episodeLength=${Math.round(duration)}`, undefined, { retries: 0 })
  const body = (await res.json()) as { results?: { skipType: string; episodeLength: number; interval: { startTime: number; endTime: number } }[] }
  return (body.results ?? [])
    .filter((r) => (r.skipType === 'op' || r.skipType === 'ed') && Math.abs(r.episodeLength - duration) <= LENGTH_TOLERANCE)
    .map((r) => ({ kind: r.skipType as SkipRange['kind'], start: r.interval.startTime, end: r.interval.endTime, verified: true }))
}

export function mergeSkips(source: SkipRange[] | undefined, matched: SkipRange[], duration = Infinity): SkipRange[] | undefined {
  const kinds = new Set(matched.map((r) => r.kind))
  const merged = [...matched, ...(source ?? []).filter((r) => !kinds.has(r.kind) && r.end <= duration + 1)]
  return merged.length ? merged : undefined
}
