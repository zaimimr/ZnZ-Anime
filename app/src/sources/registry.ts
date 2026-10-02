import { getSettings } from '../settings'
import type { Lang } from '../types'
import { justanime } from './justanime'
import { miruro } from './miruro'
import type { Episode, MediaRef, SourceAdapter, SourceShow, Stream } from './types'

export const adapters: Record<string, SourceAdapter> = { miruro, justanime }

export function orderedAdapters(): SourceAdapter[] {
  const ordered = getSettings().sourceOrder.map((id) => adapters[id]).filter(Boolean)
  const rest = Object.values(adapters).filter((a) => !ordered.includes(a))
  return [...ordered, ...rest]
}

export async function resolveFirst(media: MediaRef, skip: string[] = []): Promise<{ adapter: SourceAdapter; show: SourceShow; episodes: Episode[] } | null> {
  let failure: unknown
  for (const adapter of orderedAdapters()) {
    if (skip.includes(adapter.id)) continue
    try {
      const show = await adapter.resolve(media)
      if (!show) continue
      const episodes = await adapter.episodes(show)
      if (episodes.length) return { adapter, show, episodes }
    } catch (e) {
      failure = e
    }
  }
  if (failure) throw failure
  return null
}

export async function streamsWithFallback(adapter: SourceAdapter, show: SourceShow, ep: number, lang: Lang): Promise<{ streams: Stream[]; lang: Lang }> {
  const streams = await adapter.stream(show, ep, lang)
  if (streams.length) return { streams, lang }
  const other: Lang = lang === 'sub' ? 'dub' : 'sub'
  return { streams: await adapter.stream(show, ep, other), lang: other }
}
