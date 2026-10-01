export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const storageKey = `znz.cache.${key}`
  try {
    const hit = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as { at: number; value: T } | null
    if (hit && Date.now() - hit.at < ttlMs) return hit.value
  } catch {
    localStorage.removeItem(storageKey)
  }
  const value = await load()
  try {
    localStorage.setItem(storageKey, JSON.stringify({ at: Date.now(), value }))
  } catch {
    localStorage.removeItem(storageKey)
  }
  return value
}
