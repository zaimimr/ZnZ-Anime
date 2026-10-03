import type { Lang } from '../../types'
import { cleanLabel } from '../miruro/parse'
import type { Episode, SkipRange, Stream, Subtitle } from '../types'

type Raw = Record<string, any>

const list = (value: unknown): Raw[] => (Array.isArray(value) ? value : [])

const kinds: Record<string, SkipRange['kind']> = { intro: 'op', outro: 'ed' }

export function parseEpisodes(data: unknown, now = Date.now()): Episode[] {
  return list(data)
    .filter((e) => Number.isFinite(Number(e.number)) && !(e.airDateUtc && Date.parse(e.airDateUtc) > now))
    .map((e) => ({
      number: Number(e.number),
      title: e.titles?.en ?? e.titles?.['x-jat'] ?? undefined,
      ...(e.description ? { synopsis: e.description } : {}),
      ...(e.img ? { thumbnail: e.img } : {}),
      ...(Number(e.length) > 0 ? { duration: Number(e.length) * 60 } : {}),
      ...(e.isFiller ? { filler: 'filler' as const } : {}),
    }))
}

export function providerIds(data: unknown, lang: Lang): string[] {
  return list((data as Raw)?.[lang === 'sub' ? 'subProviders' : 'dubProviders']).map((p) => p.id).filter(Boolean)
}

export function parseSources(provider: string, data: unknown): Stream[] {
  const seen = new Set<string>()
  const subtitles: Subtitle[] = list((data as Raw)?.tracks)
    .filter((t) => t.url && (t.kind ?? 'captions') === 'captions')
    .map((t) => ({ url: t.url, lang: t.lang ?? 'und', label: cleanLabel(t.label ?? t.lang ?? 'Subtitles'), ...(t.default ? { default: true } : {}) }))
    .filter((s) => !seen.has(s.label) && Boolean(seen.add(s.label)))
  const skip = list((data as Raw)?.chapters)
    .filter((c) => kinds[String(c.title).toLowerCase()] && Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start)
    .map((c) => ({ kind: kinds[String(c.title).toLowerCase()], start: c.start, end: c.end }))
  const headers: Record<string, string> | undefined = (data as Raw)?.headers
  return list((data as Raw)?.sources)
    .filter((s) => s.url)
    .map((s) => ({
      provider,
      url: s.url,
      format: /\.mp4($|\?)/.test(s.url) ? 'mp4' : 'hls',
      ...(s.quality && s.quality !== 'auto' ? { quality: s.quality } : {}),
      ...(headers && Object.keys(headers).length ? { headers } : {}),
      subtitles,
      ...(skip.length ? { skip } : {}),
    }) as Stream)
}
