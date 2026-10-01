import type { KVLike } from '../src/pair'

export function memoryKV(): KVLike & { store: Map<string, string>; ttls: Map<string, number | undefined> } {
  const store = new Map<string, string>()
  const ttls = new Map<string, number | undefined>()
  return {
    store,
    ttls,
    async get(key) { return store.get(key) ?? null },
    async put(key, value, options) { store.set(key, value); ttls.set(key, options?.expirationTtl) },
    async delete(key) { store.delete(key) },
  }
}
