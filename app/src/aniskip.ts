import { hosts } from './hosts'
import { request } from './http'
import type { SkipRange } from './sources/types'

export async function aniskip(malId: number, ep: number): Promise<SkipRange[]> {
  const res = await request(`${hosts.aniskip}/v2/skip-times/${malId}/${ep}?types=op&types=ed&episodeLength=0`, undefined, { retries: 0 })
  const body = (await res.json()) as { results?: { skipType: string; interval: { startTime: number; endTime: number } }[] }
  return (body.results ?? [])
    .filter((r) => r.skipType === 'op' || r.skipType === 'ed')
    .map((r) => ({ kind: r.skipType as SkipRange['kind'], start: r.interval.startTime, end: r.interval.endTime }))
}

export function mergeSkips(primary: SkipRange[] | undefined, fallback: SkipRange[]): SkipRange[] | undefined {
  const kinds = new Set(primary?.map((r) => r.kind))
  const merged = [...(primary ?? []), ...fallback.filter((r) => !kinds.has(r.kind))]
  return merged.length ? merged : undefined
}
