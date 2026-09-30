import type { Lang } from '../types'
export interface SourceShow { source: string; id: string }
export interface Episode { number: number; title?: string }
export interface Subtitle { url: string; lang: string; label: string; default?: boolean }
export interface SkipRange { kind: 'op' | 'ed'; start: number; end: number }
export interface Stream { provider: string; url: string; format: 'hls' | 'mp4'; quality?: string; headers?: Record<string, string>; subtitles: Subtitle[]; skip?: SkipRange[] }
export interface MediaRef { anilistId: number; titles: string[] }
export interface SourceAdapter {
  id: string
  resolve(media: MediaRef): Promise<SourceShow | null>
  episodes(show: SourceShow): Promise<Episode[]>
  stream(show: SourceShow, ep: number, lang: Lang): Promise<Stream[]>
}
