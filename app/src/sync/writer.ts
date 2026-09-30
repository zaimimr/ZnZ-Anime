import { saveEntry } from '../anilist/api'
import { getToken } from '../auth/tokens'
import { saveMalEntry } from '../mal/api'
import type { Change } from '../types'
import { enqueue, readQueue, removeFromQueue } from './queue'

export async function saveEverywhere(change: Change): Promise<void> {
  await saveEntry(change)
  if (!change.malId || !getToken('mal')) return
  try {
    await saveMalEntry(change)
  } catch {
    enqueue(change)
  }
}

export async function flushQueue(): Promise<void> {
  if (!getToken('mal')) return
  for (const change of readQueue()) {
    try {
      await saveMalEntry(change)
      removeFromQueue(change.malId!)
    } catch {
      continue
    }
  }
}
