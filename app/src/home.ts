import type { Card } from './types'

export function favoriteGenres(ids: number[], genres: Record<number, string[]>, count = 2): string[] {
  const weights = new Map<string, number>()
  ids.forEach((id, rank) => {
    for (const genre of genres[id] ?? []) weights.set(genre, (weights.get(genre) ?? 0) + 1 / (1 + rank / 10))
  })
  return [...weights].sort((a, b) => b[1] - a[1]).slice(0, count).map(([genre]) => genre)
}

export function distinct(rows: Card[][], exclude: Set<number>, limit = 30): Card[][] {
  const seen = new Set(exclude)
  return rows.map((cards) => {
    const kept = cards.filter((c) => !seen.has(c.id)).slice(0, limit)
    for (const c of kept) seen.add(c.id)
    return kept
  })
}
