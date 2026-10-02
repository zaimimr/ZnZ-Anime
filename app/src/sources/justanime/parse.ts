import type { Lang } from '../../types'
import type { Episode, SkipRange, Stream, Subtitle } from '../types'

type Raw = Record<string, any>

const list = (value: unknown): Raw[] => (Array.isArray(value) ? value : [])

const ORDER = ['momo', 'calm', 'zoko', 'nami', 'gigi']

const BLOCKED = ['zone', 'revo']

const rank = (name: string) => (ORDER.includes(name) ? ORDER.indexOf(name) : ORDER.length)

const qualityValue = (q?: string) => Number(q?.match(/\d+/)?.[0] ?? 0)

export function parseEpisodes(pages: unknown[], now = Date.now()): Episode[] {
  return pages
    .flatMap((page) => list((page as Raw)?.episodes))
    .filter((e) => Number.isFinite(Number(e.number)) && !(e.airDate && Date.parse(e.airDate) > now))
    .map((e) => ({
      number: Number(e.number),
      title: e.title ?? undefined,
      ...(e.description ? { synopsis: e.description } : {}),
      ...(e.image ? { thumbnail: e.image } : {}),
    }))
}

export function availableServers(data: unknown, lang: Lang): string[] {
  const servers: Raw = (data as Raw)?.servers ?? {}
  return Object.keys(servers).filter((name) => servers[name]?.[lang] && !BLOCKED.includes(name)).sort((a, b) => rank(a) - rank(b))
}

function range(kind: SkipRange['kind'], value: Raw | null | undefined): SkipRange[] {
  return Number.isFinite(value?.start) && Number.isFinite(value?.end) && value!.end > value!.start ? [{ kind, start: value!.start, end: value!.end }] : []
}

export function parseServer(name: string, data: unknown, lang: Lang): Stream[] {
  const track: Raw | undefined = (data as Raw)?.[lang]
  if (!track) return []
  const subtitles: Subtitle[] = [...list(track.subtitles), ...list(track.tracks)]
    .filter((s) => s.file)
    .map((s) => ({ url: s.file, lang: /english/i.test(s.label ?? '') ? 'en' : 'und', label: s.label ?? 'Subtitles', ...(s.default ? { default: true } : {}) }))
  const skip = [...range('op', track.intro), ...range('ed', track.outro)]
  return list(track.sources)
    .filter((s) => s.url)
    .sort((a, b) => qualityValue(b.quality) - qualityValue(a.quality))
    .map((s) => {
      const headers: Record<string, string> | undefined = s.headers ?? track.headers
      return {
        provider: name,
        url: s.url,
        format: s.isM3U8 === false ? 'mp4' : 'hls',
        ...(s.quality && s.quality !== 'auto' ? { quality: s.quality } : {}),
        ...(headers && Object.keys(headers).length ? { headers } : {}),
        subtitles,
        ...(skip.length ? { skip } : {}),
      } as Stream
    })
}
