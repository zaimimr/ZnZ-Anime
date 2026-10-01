import type { Change } from '../types'

export type Target = 'anilist' | 'mal'

export interface QueueItem {
  target: Target
  change: Change
  queuedAt?: number
  attempts?: number
}

const KEY = 'znz.retry'

const idOf = (item: QueueItem) => `${item.target}:${item.target === 'mal' ? item.change.malId : item.change.anilistId}`
const same = (a: QueueItem, b: QueueItem) => idOf(a) === idOf(b) && JSON.stringify(a.change) === JSON.stringify(b.change)

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
  const item = { target, change, queuedAt: Date.now() }
  writeQueue([...readQueue().filter((i) => idOf(i) !== idOf(item)), item])
}

export function removeFromQueue(item: QueueItem, onlyIfUnchanged = false): void {
  writeQueue(readQueue().filter((i) => idOf(i) !== idOf(item) || (onlyIfUnchanged && !same(i, item))))
}

export function countAttempt(item: QueueItem): void {
  writeQueue(readQueue().map((i) => (same(i, item) ? { ...i, attempts: (i.attempts ?? 0) + 1 } : i)))
}

export function clearQueue(target: Target): void {
  writeQueue(readQueue().filter((i) => i.target !== target))
}
