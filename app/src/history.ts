import { mediaLookup, toListItem } from './anilist/api'
import type { ListItem } from './types'

export interface Played { id: number; ep: number; at: number; done: boolean }

const KEY = 'znz.history'
const LIMIT = 50

export function readHistory(): Played[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function recordPlay(id: number, ep: number, done: boolean): void {
  const entry: Played = { id, ep, at: Date.now(), done }
  localStorage.setItem(KEY, JSON.stringify([entry, ...readHistory().filter((h) => h.id !== id)].slice(0, LIMIT)))
}

const finishedShow = (item: ListItem, played: Played) => played.done && item.card.episodes !== undefined && played.ep >= item.card.episodes

export function continueWatching(list: ListItem[], history: Played[], unlisted: ListItem[] = []): ListItem[] {
  const played = new Map(history.map((h) => [h.id, h]))
  const recent = (i: ListItem) => Math.max(played.get(i.card.id)?.at ?? 0, i.updatedAt)
  return [...list, ...unlisted.filter((u) => !list.some((i) => i.card.id === u.card.id))]
    .filter((i) => {
      const h = played.get(i.card.id)
      if (!h) return i.entry.status === 'watching' || i.entry.status === 'rewatching'
      return i.entry.status !== 'dropped' && !finishedShow(i, h)
    })
    .sort((a, b) => recent(b) - recent(a))
}

export async function unlistedItems(list: ListItem[], history: Played[]): Promise<ListItem[]> {
  const known = new Set(list.map((i) => i.card.id))
  const missing = history.filter((h) => !known.has(h.id))
  if (!missing.length) return []
  const media = await mediaLookup('id', missing.map((h) => h.id))
  return missing.flatMap((h) => {
    const m = media.get(h.id)
    return m ? [toListItem(m, { status: 'watching', progress: 0, score: 0 }, 0)] : []
  })
}
