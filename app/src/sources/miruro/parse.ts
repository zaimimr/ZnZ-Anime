import type { Lang } from '../../types'
import type { Episode, SkipRange, Stream, Subtitle } from '../types'

type Raw = Record<string, any>

const list = (value: unknown): Raw[] => (Array.isArray(value) ? value : [])

export function pickShow(data: unknown, anilistId: number): string | null {
  const match = list((data as Raw)?.data).find((item) => list(item.external_ids?.anilist).map(String).includes(String(anilistId)))
  return match?.id ?? null
}


export function cleanLabel(label: string): string {
  const base = label.replace(/\.vtt$/i, '').trim()
  const parts = base.match(/^(.+?)(?:\s+-\s+|\s*\(-\s*)(.+?)\)?$/)
  if (!parts) return base
  const rest = parts[2].startsWith(parts[1]) ? parts[2].slice(parts[1].length) : parts[2]
  const detail = rest.replace(/[()]/g, '').trim()
  return detail ? `${parts[1]} (${detail})` : parts[1]
}

function subtitles(raw: Raw[], headers?: Record<string, string>): Subtitle[] {
  const seen = new Set<string>()
  return raw
    .filter((s) => (s.format ?? 'vtt') === 'vtt' && (s.file ?? s.url))
    .map((s) => ({ url: s.file ?? s.url, lang: s.language ?? s.lang ?? 'und', label: cleanLabel(s.label ?? s.language ?? 'Subtitles'), ...(s.default ? { default: true } : {}), ...(headers ? { headers } : {}) }))
    .filter((s) => !seen.has(s.label) && Boolean(seen.add(s.label)))
}

function skips(...sources: Raw[]): SkipRange[] | undefined {
  const all = sources.flatMap((s) => list(s?.skip_times))
  const ranges = all
    .filter((s) => (s.kind === 'op' || s.kind === 'ed') && Number.isFinite(s.start_seconds) && Number.isFinite(s.end_seconds))
    .map((s) => ({ kind: s.kind, start: s.start_seconds, end: s.end_seconds }) as SkipRange)
  return ranges.length ? ranges : undefined
}

export function parseEpisodes(data: unknown): Episode[] {
  return list((data as Raw)?.data).filter((e) => !Number.isNaN(Number(e.episode_number))).map((e) => {
    const skip = skips(e)
    return {
      number: Number(e.episode_number),
      title: e.title ?? undefined,
      ...(e.synopsis ? { synopsis: e.synopsis } : {}),
      ...(e.thumbnail_url ? { thumbnail: String(e.thumbnail_url).replace('/t/p/original/', '/t/p/w300/') } : {}),
      ...(typeof e.duration_seconds === 'number' ? { duration: e.duration_seconds } : {}),
      ...(skip ? { skip } : {}),
      ...(e.canon_type === 'filler' || e.canon_type === 'mixed' ? { filler: e.canon_type } : {}),
    }
  })
}

const qualityValue = (q?: string) => Number(q?.match(/\d+/)?.[0] ?? 0)

const serverHeaders = (server: Raw): Record<string, string> | undefined => (server.headers && Object.keys(server.headers).length ? server.headers : undefined)

function subtitlePool(tracks: Raw[]): { provider: string; track: string; subtitles: Subtitle[] }[] {
  return tracks.flatMap((track) =>
    list(track.providers).flatMap((provider) =>
      list(provider.servers).map((server) => ({ provider: provider.provider, track: track.track, subtitles: subtitles([...list(provider.subtitles), ...list(server.subtitles)], serverHeaders(server)) })),
    ),
  ).filter((entry) => entry.subtitles.length)
}

function borrowed(pool: ReturnType<typeof subtitlePool>, provider: string): Subtitle[] {
  const rank = (e: { provider: string; track: string }) => (e.provider === provider ? 0 : 2) + (e.track === 'ssub' ? 0 : 1)
  const best = [...pool].sort((a, b) => rank(a) - rank(b))[0]
  return best ? best.subtitles.map((s) => { const copy = { ...s }; delete copy.default; return copy }) : []
}

export function parseStreams(data: unknown, lang: Lang): Stream[] {
  const wanted = lang === 'sub' ? ['sub', 'ssub'] : ['dub']
  const all = list((data as Raw)?.tracks)
  const pool = subtitlePool(all)
  const tracks = all.filter((t) => wanted.includes(t.track)).sort((a, b) => wanted.indexOf(a.track) - wanted.indexOf(b.track))
  return tracks.flatMap((track) =>
    list(track.providers).flatMap((provider) =>
      list(provider.servers).flatMap((server) =>
        list(server.streams)
          .filter((s) => s.url && (s.format === 'hls' || s.format === 'mp4'))
          .sort((a, b) => qualityValue(b.quality) - qualityValue(a.quality))
          .map((s) => {
            const headers = serverHeaders(server)
            const skip = skips(provider, server, s)
            const own = subtitles([...list(provider.subtitles), ...list(server.subtitles)])
            return {
              provider: provider.provider,
              url: s.url,
              format: s.format,
              ...(s.quality ? { quality: s.quality } : {}),
              ...(headers ? { headers } : {}),
              subtitles: own.length || track.track === 'sub' ? own : borrowed(pool, provider.provider),
              ...(skip ? { skip } : {}),
              ...(provider.thumbnails?.vtt ? { thumbnails: provider.thumbnails.vtt } : {}),
            } as Stream
          }),
      ),
    ),
  )
}
