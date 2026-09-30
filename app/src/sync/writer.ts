import { deleteEntry, saveEntry } from '../anilist/api'
import { getToken } from '../auth/tokens'
import { AuthError } from '../http'
import { invalidateLibrary, removeLocal, saveLocal, syncTargets } from '../library'
import { deleteMalEntry, saveMalEntry } from '../mal/api'
import type { Change } from '../types'
import { enqueue, readQueue, removeFromQueue, type Target } from './queue'

export class NotOnMalError extends Error {
  constructor() {
    super('This show is not on MyAnimeList, so it cannot be saved to your MAL list.')
  }
}

async function attempt(target: Target, change: Change): Promise<AuthError | null> {
  try {
    await (target === 'anilist' ? saveEntry(change) : saveMalEntry(change))
    return null
  } catch (e) {
    enqueue(target, change)
    return e instanceof AuthError ? e : null
  }
}

export async function saveEverywhere(change: Change): Promise<void> {
  invalidateLibrary()
  const targets = syncTargets()
  if (!targets.length) return saveLocal(change)
  if (targets.length === 1 && targets[0] === 'mal' && !change.malId) throw new NotOnMalError()
  let auth: AuthError | null = null
  for (const target of targets) {
    if (target === 'mal' && !change.malId) continue
    auth = (await attempt(target, change)) ?? auth
  }
  if (auth) throw auth
}

export async function removeEverywhere(anilistId: number, listId: number | undefined, malId: number | undefined): Promise<void> {
  invalidateLibrary()
  const targets = syncTargets()
  if (!targets.length) return removeLocal(anilistId)
  if (targets.includes('anilist') && listId) await deleteEntry(listId)
  if (targets.includes('mal') && malId) {
    const remove = deleteMalEntry(malId)
    await (targets[0] === 'mal' ? remove : remove.catch(() => undefined))
  }
}

export async function flushQueue(): Promise<void> {
  for (const item of readQueue()) {
    if (!getToken(item.target)) continue
    try {
      await (item.target === 'anilist' ? saveEntry(item.change) : saveMalEntry(item.change))
      removeFromQueue(item)
    } catch {
      continue
    }
  }
}
