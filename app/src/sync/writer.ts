import { saveEntry } from '../anilist/api'
import { getToken } from '../auth/tokens'
import { AuthError } from '../http'
import { saveMalEntry } from '../mal/api'
import type { Change } from '../types'
import { enqueue, readQueue, removeFromQueue, type Target } from './queue'

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
  const anilistAuth = await attempt('anilist', change)
  const malAuth = change.malId && getToken('mal') ? await attempt('mal', change) : null
  const auth = anilistAuth ?? malAuth
  if (auth) throw auth
}

export async function flushQueue(): Promise<void> {
  for (const item of readQueue()) {
    if (item.target === 'mal' && !getToken('mal')) continue
    try {
      await (item.target === 'anilist' ? saveEntry(item.change) : saveMalEntry(item.change))
      removeFromQueue(item)
    } catch {
      continue
    }
  }
}
