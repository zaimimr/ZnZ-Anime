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

const BROWSER_UA = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 9.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

async function readRest(reader: ReadableStreamDefaultReader<Uint8Array>, first: Uint8Array): Promise<string> {
  const chunks = [first]
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder().decode(bytes)
}

function replay(reader: ReadableStreamDefaultReader<Uint8Array>, first: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (first.length) controller.enqueue(first)
    },
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) controller.close()
      else controller.enqueue(value)
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

export async function proxy(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const encodedTarget = url.searchParams.get('u')
  const encodedReferer = url.searchParams.get('r')
  if (!encodedTarget) return json({ error: 'missing u' }, 400)
  const target = b64urlDecode(encodedTarget)
  if (!/^https?:\/\//.test(target)) return json({ error: 'bad target' }, 400)
  const referer = encodedReferer ? b64urlDecode(encodedReferer) : undefined
  const headers = new Headers({ 'user-agent': req.headers.get('user-agent') || BROWSER_UA })
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
  if (!upstream.ok || !upstream.body) return new Response(upstream.body, { status: upstream.status, headers: outHeaders })
  const reader = upstream.body.getReader()
  const { value } = await reader.read()
  const first = value ?? new Uint8Array()
  const isPlaylist = new TextDecoder().decode(first.slice(0, 32)).trimStart().startsWith('#EXTM3U')
  if (!isPlaylist) return new Response(replay(reader, first), { status: upstream.status, headers: outHeaders })
  const text = await readRest(reader, first)
  outHeaders.delete('content-length')
  outHeaders.set('content-type', 'application/vnd.apple.mpegurl')
  return new Response(rewritePlaylist(text, target, `${url.origin}/proxy`, referer), { status: upstream.status, headers: outHeaders })
}
