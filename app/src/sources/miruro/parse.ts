import type { Lang } from '../../types'
import type { Episode, SkipRange, Stream, Subtitle } from '../types'

type Raw = Record<string, any>

const list = (value: unknown): Raw[] => (Array.isArray(value) ? value : [])

export function pickShow(data: unknown, anilistId: number): string | null {
  const match = list((data as Raw)?.data).find((item) => list(item.external_ids?.anilist).map(String).includes(String(anilistId)))
  return match?.id ?? null
}

export function parseEpisodes(data: unknown): Episode[] {
  return list((data as Raw)?.data).map((e) => ({ number: Number(e.episode_number), title: e.title ?? undefined }))
}

function subtitles(raw: Raw[]): Subtitle[] {
  return raw
    .filter((s) => (s.format ?? 'vtt') === 'vtt' && (s.file ?? s.url))
    .map((s) => ({ url: s.file ?? s.url, lang: s.language ?? s.lang ?? 'und', label: s.label ?? s.language ?? 'Subtitles', ...(s.default ? { default: true } : {}) }))
}

function skips(...sources: Raw[]): SkipRange[] | undefined {
  const all = sources.flatMap((s) => list(s?.skip_times))
  const ranges = all
    .filter((s) => (s.kind === 'op' || s.kind === 'ed') && typeof s.start_seconds === 'number')
    .map((s) => ({ kind: s.kind, start: s.start_seconds, end: s.end_seconds }) as SkipRange)
  return ranges.length ? ranges : undefined
}

const qualityValue = (q?: string) => Number(q?.match(/\d+/)?.[0] ?? 0)

export function parseStreams(data: unknown, lang: Lang): Stream[] {
  const wanted = lang === 'sub' ? ['sub', 'ssub'] : ['dub']
  const tracks = list((data as Raw)?.tracks).filter((t) => wanted.includes(t.track)).sort((a, b) => wanted.indexOf(a.track) - wanted.indexOf(b.track))
  return tracks.flatMap((track) =>
    list(track.providers).flatMap((provider) =>
      list(provider.servers).flatMap((server) =>
        list(server.streams)
          .filter((s) => s.url && (s.format === 'hls' || s.format === 'mp4'))
          .sort((a, b) => qualityValue(b.quality) - qualityValue(a.quality))
          .map((s) => {
            const headers = server.headers && Object.keys(server.headers).length ? server.headers : undefined
            const skip = skips(provider, server, s)
            return {
              provider: provider.provider,
              url: s.url,
              format: s.format,
              ...(s.quality ? { quality: s.quality } : {}),
              ...(headers ? { headers } : {}),
              subtitles: subtitles([...list(provider.subtitles), ...list(server.subtitles)]),
              ...(skip ? { skip } : {}),
            } as Stream
          }),
      ),
    ),
  )
}
