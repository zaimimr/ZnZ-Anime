import { hosts } from '../hosts'
import { request } from '../http'
import { playableUrl } from './proxy'

export interface ThumbCue { start: number; end: number; url: string; x: number; y: number; w: number; h: number }

const seconds = (t: string) => t.split(':').reduce((sum, part) => sum * 60 + Number(part), 0)

export function parseThumbs(text: string, base: string): ThumbCue[] {
  const cues: ThumbCue[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const time = lines[i].match(/([\d:.]+)\s*-->\s*([\d:.]+)/)
    const target = lines[i + 1]?.trim()
    if (!time || !target) continue
    const [file, hash] = target.split('#xywh=')
    const [x, y, w, h] = (hash ?? '0,0,0,0').split(',').map(Number)
    cues.push({ start: seconds(time[1]), end: seconds(time[2]), url: new URL(file, base).toString(), x, y, w, h })
  }
  return cues.filter((c) => c.w > 0 && c.h > 0)
}

export async function loadThumbs(url: string, headers?: Record<string, string>): Promise<ThumbCue[]> {
  const res = await request(playableUrl(url, headers), undefined, { retries: 0 })
  const text = await res.text()
  if (!text.startsWith('WEBVTT')) return []
  return parseThumbs(text, url).map((c) => ({ ...c, url: c.url.startsWith(`${hosts.auth}/proxy`) ? c.url : playableUrl(c.url, headers) }))
}

export function thumbAt(cues: ThumbCue[], time: number): ThumbCue | undefined {
  return cues.find((c) => time >= c.start && time < c.end) ?? (time >= (cues.at(-1)?.end ?? Infinity) ? cues.at(-1) : undefined)
}
