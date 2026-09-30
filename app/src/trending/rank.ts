export function rankTrends(rows: { mediaId: number; trending: number }[], limit = 50): number[] {
  const totals = new Map<number, number>()
  for (const row of rows) totals.set(row.mediaId, (totals.get(row.mediaId) ?? 0) + row.trending)
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id)
}
