import { b64urlDecode, b64urlEncode } from './b64'
import { cors, json } from './pair'

function proxied(url: string, proxyBase: string, referer?: string): string {
  const r = referer ? `&r=${b64urlEncode(referer)}` : ''
  return `${proxyBase}?u=${b64urlEncode(url)}${r}`
}

export function rewritePlaylist(body: string, playlistUrl: string, proxyBase: string, referer?: string): string {
  const absolute = (value: string) => proxied(new URL(value, playlistUrl).toString(), proxyBase, referer)
  return body
    .split('\n')
    .map((raw) => {
      const line = raw.trim()
      if (!line) return raw
      if (line.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${absolute(uri)}"`)
      return absolute(line)
    })
    .join('\n')
}

export async function proxy(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const encodedTarget = url.searchParams.get('u')
  const encodedReferer = url.searchParams.get('r')
  if (!encodedTarget) return json({ error: 'missing u' }, 400)
  const target = b64urlDecode(encodedTarget)
  if (!/^https?:\/\//.test(target)) return json({ error: 'bad target' }, 400)
  const referer = encodedReferer ? b64urlDecode(encodedReferer) : undefined
  const headers = new Headers()
  if (referer) {
    headers.set('referer', referer)
    headers.set('origin', new URL(referer).origin)
  }
  const range = req.headers.get('range')
  if (range) headers.set('range', range)
  const upstream = await fetch(target, { headers })
  const outHeaders = new Headers(cors)
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers.get(name)
    if (value) outHeaders.set(name, value)
  }
  const type = upstream.headers.get('content-type') ?? ''
  const looksLikePlaylist = /mpegurl/i.test(type) || /\.m3u8(\?|$)/.test(target)
  if (looksLikePlaylist && upstream.ok) {
    const text = await upstream.text()
    if (text.trimStart().startsWith('#EXTM3U')) {
      outHeaders.delete('content-length')
      outHeaders.set('content-type', 'application/vnd.apple.mpegurl')
      return new Response(rewritePlaylist(text, target, `${url.origin}/proxy`, referer), { status: upstream.status, headers: outHeaders })
    }
    return new Response(text, { status: upstream.status, headers: outHeaders })
  }
  return new Response(upstream.body, { status: upstream.status, headers: outHeaders })
}
