import { anilistIdsForMal, fetchList, saveEntry } from '../anilist/api'
import { fetchMalList, saveMalEntry } from '../mal/api'
import type { ListEntry } from '../types'
import { clearLocal, readLocal } from '../library'
import { type MergePlan, planMerge } from './merge'
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

export async function copyLocalList(onProgress: (done: number, total: number) => void, delayMs = 700): Promise<void> {
  const entries = readLocal()
  let done = 0
  for (const e of entries) {
    await saveEverywhere({ anilistId: e.anilistId, malId: e.malId, status: e.status, progress: e.progress, score: e.score })
    onProgress(++done, entries.length)
    await sleep(delayMs)
  }
  clearLocal()
}
