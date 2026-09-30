import { type Details, mediaLookup, fetchList, toListItem } from './anilist/api'
import { getToken } from './auth/tokens'
import { AuthError } from './http'
import { fetchMalList, malEntry } from './mal/api'
import { getSettings } from './settings'
import type { Change, ListItem, Provider, Status } from './types'

export type ListSource = Provider | 'local'

export interface LocalEntry {
  anilistId: number
  malId?: number
  status: Status
  progress: number
  score: number
  updatedAt: number
}

export interface LibraryEntry {
  status?: Status
  progress: number
  score: number
  listId?: number
}

const LOCAL = 'znz.local.list'

export function linked(): Provider[] {
  return (['anilist', 'mal'] as Provider[]).filter((p) => getToken(p))
}

export function listSource(): ListSource {
  return linked()[0] ?? 'local'
}

export function syncTargets(): Provider[] {
  const all = linked()
  return all.length > 1 && !getSettings().syncBoth ? all.slice(0, 1) : all
}

export function readLocal(): LocalEntry[] {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL) ?? '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function writeLocal(entries: LocalEntry[]): void {
  localStorage.setItem(LOCAL, JSON.stringify(entries))
  invalidateLibrary()
}

export function saveLocal(change: Change): void {
  if (!change.anilistId) return
  const entry: LocalEntry = { anilistId: change.anilistId, malId: change.malId, status: change.status, progress: change.progress, score: change.score, updatedAt: Date.now() }
  writeLocal([entry, ...readLocal().filter((e) => e.anilistId !== change.anilistId)])
}

export function removeLocal(anilistId: number): void {
  writeLocal(readLocal().filter((e) => e.anilistId !== anilistId))
}

export function clearLocal(): void {
  writeLocal([])
}

let memo: { at: number; source: ListSource; items: Promise<ListItem[]> } | null = null

export function invalidateLibrary(): void {
  memo = null
}

async function load(source: ListSource): Promise<ListItem[]> {
  if (source === 'anilist') return fetchList()
  if (source === 'mal') {
    const entries = await fetchMalList()
    const media = await mediaLookup('idMal', entries.map((e) => e.malId!))
    return entries.flatMap((e) => {
      const m = media.get(e.malId!)
      return m ? [toListItem(m, e, e.updatedAt ?? 0)] : []
    })
  }
  const entries = readLocal()
  const media = await mediaLookup('id', entries.map((e) => e.anilistId))
  return entries.flatMap((e) => {
    const m = media.get(e.anilistId)
    return m ? [toListItem(m, e, e.updatedAt)] : []
  })
}

export function fetchLibrary(retry = true): Promise<ListItem[]> {
  const source = listSource()
  if (memo && memo.source === source && Date.now() - memo.at < 30_000) return memo.items
  const items = load(source).catch((e: unknown) => {
    if (retry && e instanceof AuthError) return fetchLibrary(false)
    throw e
  })
  const current = { at: Date.now(), source, items }
  memo = current
  items.catch(() => {
    if (memo === current) memo = null
  })
  return items
}

export async function libraryEntry(info: Details): Promise<LibraryEntry> {
  const source = listSource()
  if (source === 'local') {
    const local = readLocal().find((e) => e.anilistId === info.id)
    return local ? { status: local.status, progress: local.progress, score: local.score } : { progress: 0, score: 0 }
  }
  const fromAnilist: LibraryEntry = { status: info.listStatus, progress: info.progress, score: info.score, listId: info.listId }
  const readMal = info.idMal && syncTargets().includes('mal')
  if (!readMal) return fromAnilist
  if (source === 'mal') return malEntry(info.idMal!)
  const mal = await malEntry(info.idMal!).catch(() => null)
  return mal ? { ...fromAnilist, progress: Math.max(fromAnilist.progress, mal.progress) } : fromAnilist
}
