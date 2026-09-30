import type { Change } from '../types'

const KEY = 'znz.retry'

export function readQueue(): Change[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

function writeQueue(items: Change[]): void {
  localStorage.setItem(KEY, JSON.stringify(items))
}

export function enqueue(change: Change): void {
  writeQueue([...readQueue().filter((c) => c.malId !== change.malId), change])
}

export function removeFromQueue(malId: number): void {
  writeQueue(readQueue().filter((c) => c.malId !== malId))
}
