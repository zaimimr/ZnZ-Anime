import type { Lang } from '../types'
export interface SourceShow { source: string; id: string }
export interface Subtitle { url: string; lang: string; label: string; default?: boolean; headers?: Record<string, string> }
export interface SkipRange { kind: 'op' | 'ed'; start: number; end: number; verified?: boolean }
export interface Episode { number: number; title?: string; synopsis?: string; thumbnail?: string; duration?: number; skip?: SkipRange[]; filler?: 'filler' | 'mixed' }
export interface Stream { provider: string; url: string; format: 'hls' | 'mp4'; quality?: string; headers?: Record<string, string>; subtitles: Subtitle[]; skip?: SkipRange[]; thumbnails?: string }
export interface MediaRef { anilistId: number; titles: string[] }
export interface SourceAdapter {
  id: string
  name: string
  defaultHost: string
  check(host: string): Promise<boolean>
  resolve(media: MediaRef): Promise<SourceShow | null>
  episodes(show: SourceShow): Promise<Episode[]>
  stream(show: SourceShow, ep: number, lang: Lang): Promise<Stream[]>
}
