import { anilistEntry, deleteEntry, saveEntry } from '../anilist/api'
import { getToken } from '../auth/tokens'
import { AuthError, HttpError } from '../http'
import { invalidateLibrary, removeLocal, saveLocal, syncTargets } from '../library'
import { deleteMalEntry, malEntry, saveMalEntry } from '../mal/api'
import type { Change } from '../types'
import { countAttempt, enqueue, type QueueItem, readQueue, removeFromQueue, type Target } from './queue'

const MAX_ATTEMPTS = 5

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class NotOnMalError extends Error {
  constructor() {
    super('This show is not on MyAnimeList, so it cannot be saved to your MAL list.')
  }
}

function retryable(e: unknown): boolean {
  if (e instanceof AuthError) return true
  if (e instanceof HttpError) return e.status === 429 || e.status >= 500
  return e instanceof TypeError || (e as Error)?.name === 'AbortError'
}

function send(target: Target, change: Change): Promise<number | undefined> {
  return target === 'anilist' ? saveEntry(change) : saveMalEntry(change).then(() => undefined)
}

async function attempt(target: Target, change: Change): Promise<{ listId?: number; auth?: AuthError }> {
  try {
    const listId = await send(target, change)
    removeFromQueue({ target, change })
    return { listId }
  } catch (e) {
    if (retryable(e)) enqueue(target, change)
    else removeFromQueue({ target, change })
    return e instanceof AuthError ? { auth: e } : {}
  }
}

export async function saveEverywhere(change: Change): Promise<number | undefined> {
  invalidateLibrary()
  const targets = syncTargets()
  if (!targets.length) return void saveLocal(change)
  if (targets.length === 1 && targets[0] === 'mal' && !change.malId) throw new NotOnMalError()
  let auth: AuthError | undefined
  let listId: number | undefined
  for (const target of targets) {
    if (target === 'mal' && !change.malId) continue
    const result = await attempt(target, change)
    auth = result.auth ?? auth
    listId = result.listId ?? listId
  }
  invalidateLibrary()
  if (auth) throw auth
  return listId
}

export async function removeEverywhere(anilistId: number, listId: number | undefined, malId: number | undefined): Promise<void> {
  invalidateLibrary()
  for (const target of ['anilist', 'mal'] as const) removeFromQueue({ target, change: { anilistId, malId, status: 'planning', progress: 0, score: 0 } })
  const targets = syncTargets()
  if (!targets.length) return removeLocal(anilistId)
  if (targets.includes('anilist') && listId) await deleteEntry(listId)
  if (targets.includes('mal') && malId) {
    const remove = deleteMalEntry(malId)
    await (targets[0] === 'mal' ? remove : remove.catch(() => undefined))
  }
}

async function stale(item: QueueItem): Promise<boolean> {
  const { target, change } = item
  const remote = target === 'anilist' ? await anilistEntry(change.anilistId!) : await malEntry(change.malId!)
  if (!remote) return false
  if (item.queuedAt && remote.updatedAt) return remote.updatedAt > item.queuedAt
  return remote.progress > change.progress
}

export async function flushQueue(delayMs = 700): Promise<void> {
  let sent = false
  for (const item of readQueue()) {
    if (!getToken(item.target)) continue
    if (sent) await sleep(item.target === 'anilist' ? delayMs : delayMs / 2)
    sent = true
    try {
      if (!(await stale(item))) await send(item.target, item.change)
      removeFromQueue(item, true)
    } catch (e) {
      if (!retryable(e) || (item.attempts ?? 0) + 1 >= MAX_ATTEMPTS) removeFromQueue(item, true)
      else countAttempt(item)
      if (e instanceof HttpError && e.status === 429) return
    }
  }
}
