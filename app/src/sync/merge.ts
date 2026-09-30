import type { Change, ListEntry, Status } from '../types'

const rank: Record<Status, number> = { completed: 4, watching: 3, paused: 2, planning: 1, dropped: 0 }

type Merged = Pick<ListEntry, 'status' | 'progress' | 'score'>

export interface MergePlan {
  toAnilist: Change[]
  toMal: Change[]
  unmatched: ListEntry[]
}

export function mergeEntry(a: ListEntry | undefined, m: ListEntry | undefined): Merged {
  const only = a ?? m
  if (!a || !m) return { status: only!.status, progress: only!.progress, score: only!.score }
  return {
    status: rank[a.status] >= rank[m.status] ? a.status : m.status,
    progress: Math.max(a.progress, m.progress),
    score: a.score > 0 ? a.score : m.score,
  }
}

function differs(entry: ListEntry | undefined, merged: Merged): boolean {
  return !entry || entry.status !== merged.status || entry.progress !== merged.progress || entry.score !== merged.score
}

export function planMerge(anilist: ListEntry[], mal: ListEntry[], malToAnilist: Map<number, number>): MergePlan {
  const plan: MergePlan = { toAnilist: [], toMal: [], unmatched: [] }
  const malById = new Map(mal.map((m) => [m.malId!, m]))
  const seen = new Set<number>()
  for (const a of anilist) {
    if (!a.malId) {
      plan.unmatched.push(a)
      continue
    }
    const m = malById.get(a.malId)
    seen.add(a.malId)
    const merged = mergeEntry(a, m)
    const change: Change = { anilistId: a.anilistId, malId: a.malId, title: a.title, ...merged }
    if (differs(a, merged)) plan.toAnilist.push(change)
    if (differs(m, merged)) plan.toMal.push(change)
  }
  for (const m of mal) {
    if (seen.has(m.malId!)) continue
    const anilistId = malToAnilist.get(m.malId!)
    if (!anilistId) {
      plan.unmatched.push(m)
      continue
    }
    plan.toAnilist.push({ anilistId, malId: m.malId, title: m.title, status: m.status, progress: m.progress, score: m.score })
  }
  return plan
}
