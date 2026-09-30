import { anilistIdsForMal, fetchList, saveEntry } from '../anilist/api'
import { fetchMalList, saveMalEntry } from '../mal/api'
import type { ListEntry } from '../types'
import { fetchLibrary, readLocal, replaceLocal, syncTargets } from '../library'
import { type MergePlan, mergeEntry, planMerge } from './merge'
import { saveEverywhere } from './writer'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function prepareMerge(): Promise<MergePlan> {
  const [items, mal] = await Promise.all([fetchList(), fetchMalList()])
  const anilist = items.map((i) => i.entry)
  const known = new Set(anilist.map((a) => a.malId))
  const malOnly = mal.map((m) => m.malId!).filter((id) => !known.has(id))
  const ids = await anilistIdsForMal(malOnly)
  return planMerge(anilist, mal, ids)
}

export async function applyMerge(plan: MergePlan, onProgress: (done: number, total: number) => void, delayMs = 700): Promise<void> {
  const total = plan.toAnilist.length + plan.toMal.length
  let done = 0
  for (const change of plan.toAnilist) {
    await saveEntry(change)
    onProgress(++done, total)
    await sleep(delayMs)
  }
  for (const change of plan.toMal) {
    await saveMalEntry(change)
    onProgress(++done, total)
    await sleep(delayMs / 2)
  }
  localStorage.setItem('znz.unmatched', JSON.stringify(plan.unmatched))
  localStorage.setItem('znz.merged', '1')
}

export function readUnmatched(): ListEntry[] {
  try {
    return JSON.parse(localStorage.getItem('znz.unmatched') ?? '[]')
  } catch {
    return []
  }
}

export function isMerged(): boolean {
  return localStorage.getItem('znz.merged') === '1'
}

export async function copyLocalList(onProgress: (done: number, total: number) => void, delayMs = 700): Promise<number> {
  const entries = readLocal()
  const remote = new Map((await fetchLibrary()).map((i) => [i.entry.anilistId, i.entry]))
  const malOnly = syncTargets().every((t) => t === 'mal')
  const skipped = entries.filter((e) => malOnly && !e.malId)
  const copy = entries.filter((e) => !skipped.includes(e))
  let done = 0
  onProgress(done, copy.length)
  for (const e of copy) {
    const current = remote.get(e.anilistId)
    const merged = mergeEntry(current, { ...e, title: '' })
    if (!current || current.status !== merged.status || current.progress !== merged.progress || current.score !== merged.score) {
      await saveEverywhere({ anilistId: e.anilistId, malId: e.malId, ...merged })
      await sleep(delayMs)
    }
    onProgress(++done, copy.length)
  }
  replaceLocal(skipped)
  return skipped.length
}
