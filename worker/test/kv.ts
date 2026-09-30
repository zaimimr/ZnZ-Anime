import type { KVLike } from '../src/pair'

export function memoryKV(): KVLike & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    async get(key) { return store.get(key) ?? null },
    async put(key, value) { store.set(key, value) },
    async delete(key) { store.delete(key) },
  }
}
