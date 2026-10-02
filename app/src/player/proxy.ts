import { b64urlEncode } from '../b64'
import { hosts } from '../hosts'
import type { Lang } from '../types'

export function playableUrl(url: string, headers?: Record<string, string>, audio?: Lang): string {
  const referer = headers?.Referer ?? headers?.referer
  if (!referer) return url
  return `${hosts.auth}/proxy?u=${b64urlEncode(url)}&r=${b64urlEncode(referer)}${audio ? `&a=${audio}` : ''}`
}

const CHECK_MS = 6000

export async function streamWorks(url: string, format: 'hls' | 'mp4'): Promise<boolean> {
  if (format !== 'hls') return true
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHECK_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res.ok && (await res.text()).trimStart().startsWith('#EXTM3U')
  } finally {
    clearTimeout(timer)
  }
}
