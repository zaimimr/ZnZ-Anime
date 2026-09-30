import type { Change } from '../types'

export type Target = 'anilist' | 'mal'

export interface QueueItem {
  target: Target
  change: Change
}

const KEY = 'znz.retry'

const idOf = (item: QueueItem) => `${item.target}:${item.target === 'mal' ? item.change.malId : item.change.anilistId}`

export function readQueue(): QueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

function writeQueue(items: QueueItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items))
}

export function enqueue(target: Target, change: Change): void {
  const item = { target, change }
  writeQueue([...readQueue().filter((i) => idOf(i) !== idOf(item)), item])
}

export function removeFromQueue(item: QueueItem): void {
  writeQueue(readQueue().filter((i) => idOf(i) !== idOf(item)))
}
