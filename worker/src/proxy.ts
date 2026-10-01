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

const TS_PACKET = 188
const SNIFF_BYTES = 2048

async function readHead(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < SNIFF_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  const head = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    head.set(chunk, offset)
    offset += chunk.length
  }
  return head
}

export function tsStart(bytes: Uint8Array): number {
  for (let i = 0; i + TS_PACKET * 2 < bytes.length; i++) {
    if (bytes[i] === 0x47 && bytes[i + TS_PACKET] === 0x47 && bytes[i + TS_PACKET * 2] === 0x47) return i
  }
  return -1
}

async function readAll(reader: ReadableStreamDefaultReader<Uint8Array>, first: Uint8Array): Promise<Uint8Array> {
  const chunks = [first]
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
  } catch {
    return join(chunks)
  }
  return join(chunks)
}

function join(chunks: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

const REFETCHES = 3

async function completeSegment(target: string, headers: Headers, reader: ReadableStreamDefaultReader<Uint8Array>, first: Uint8Array, start: number): Promise<Uint8Array> {
  let best = (await readAll(reader, first)).subarray(start)
  for (let i = 0; i < REFETCHES && best.length % TS_PACKET !== 0; i++) {
    const retry = await fetch(target, { headers })
    if (retry.status !== 200 || !retry.body) break
    const bytes = await readAll(retry.body.getReader(), new Uint8Array())
    const offset = tsStart(bytes)
    if (offset >= 0 && bytes.length - offset > best.length) best = bytes.subarray(offset)
  }
  return best
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
  if (/text\/html/i.test(upstream.headers.get('content-type') ?? '')) return json({ error: 'upstream returned html', status: upstream.status }, 502)
  const outHeaders = new Headers({ ...cors, 'x-content-type-options': 'nosniff', 'content-security-policy': 'sandbox' })
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers.get(name)
    if (value) outHeaders.set(name, value)
  }
  if (!upstream.ok || !upstream.body) return new Response(upstream.body, { status: upstream.status, headers: outHeaders })
  const reader = upstream.body.getReader()
  const first = await readHead(reader)
  const isPlaylist = new TextDecoder().decode(first.slice(0, 32)).trimStart().startsWith('#EXTM3U')
  if (!isPlaylist) {
    const start = upstream.status === 200 ? tsStart(first) : -1
    if (start < 0) return new Response(replay(reader, first), { status: upstream.status, headers: outHeaders })
    const body = await completeSegment(target, headers, reader, first, start)
    outHeaders.set('content-type', 'video/mp2t')
    outHeaders.set('content-length', String(body.length))
    return new Response(body, { status: upstream.status, headers: outHeaders })
  }
  const text = new TextDecoder().decode(await readAll(reader, first))
  outHeaders.delete('content-length')
  outHeaders.set('content-type', 'application/vnd.apple.mpegurl')
  return new Response(rewritePlaylist(text, target, `${url.origin}/proxy`, referer), { status: upstream.status, headers: outHeaders })
}
