import { b64urlEncode, b64urlDecode, b64urlToBytes, bytesToB64url } from './b64'
import { cors, type Env, json } from './pair'

let cachedKey: { secret: string; key: Promise<CryptoKey> } | undefined

function hmacKey(secret: string): Promise<CryptoKey> {
  if (cachedKey?.secret !== secret) {
    const key = crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
    cachedKey = { secret, key }
  }
  return cachedKey.key
}

const signed = (u: string, r?: string | null) => new TextEncoder().encode(`${u}|${r ?? ''}`)

async function verify(secret: string, u: string, r: string | null, s: string): Promise<boolean> {
  try {
    return await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlToBytes(s), signed(u, r))
  } catch {
    return false
  }
}

const foreignScheme = (value: string) => /^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:/i.test(value)

async function linker(baseUrl: string, proxyBase: string, referer?: string, secret?: string) {
  const r = referer ? b64urlEncode(referer) : undefined
  const key = secret ? await hmacKey(secret) : undefined
  return async (value: string) => {
    if (foreignScheme(value)) return value
    const u = b64urlEncode(new URL(value, baseUrl).toString())
    const s = key ? `&s=${bytesToB64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, signed(u, r))))}` : ''
    return `${proxyBase}?u=${u}${r ? `&r=${r}` : ''}${s}`
  }
}

export async function rewritePlaylist(body: string, playlistUrl: string, proxyBase: string, referer?: string, secret?: string): Promise<string> {
  const absolute = await linker(playlistUrl, proxyBase, referer, secret)
  const tag = async (line: string) => {
    const uris = await Promise.all(Array.from(line.matchAll(/URI="([^"]+)"/g), (m) => absolute(m[1])))
    let i = 0
    return line.replace(/URI="([^"]+)"/g, () => `URI="${uris[i++]}"`)
  }
  const lines = await Promise.all(
    body.split('\n').map((raw) => {
      const line = raw.trim()
      if (!line) return raw
      return line.startsWith('#') ? tag(line) : absolute(line)
    }),
  )
  return lines.join('\n')
}

const AUDIO_LANGS: Record<string, string[]> = { sub: ['ja', 'jpn'], dub: ['en', 'eng'] }

export function pickAudio(body: string, lang: string | null): string {
  const codes = lang ? AUDIO_LANGS[lang] : undefined
  if (!codes) return body
  const isAudio = (line: string) => line.startsWith('#EXT-X-MEDIA:') && /TYPE=AUDIO/.test(line)
  const wanted = (line: string) => codes.includes(line.match(/LANGUAGE="([^"]+)"/)?.[1]?.toLowerCase() ?? '')
  const lines = body.split('\n')
  if (!lines.some((l) => isAudio(l) && wanted(l))) return body
  return lines
    .filter((l) => !isAudio(l) || wanted(l))
    .map((l) => (isAudio(l) ? (/DEFAULT=/.test(l) ? l.replace(/DEFAULT=(YES|NO)/, 'DEFAULT=YES') : `${l},DEFAULT=YES`) : l))
    .join('\n')
}

const cueUrl = (line: string) => /^\S+$/.test(line) && (/^(https?:\/\/|\.{0,2}\/)/i.test(line) || /\.(jpe?g|png|webp|gif|bmp|avif)([?#]|$)/i.test(line))

export async function rewriteVtt(body: string, vttUrl: string, proxyBase: string, referer?: string, secret?: string): Promise<string> {
  const absolute = await linker(vttUrl, proxyBase, referer, secret)
  let inCue = false
  const lines = await Promise.all(
    body.split('\n').map((raw) => {
      const line = raw.trim()
      if (!line) inCue = false
      else if (line.includes('-->')) inCue = true
      else if (inCue && cueUrl(line)) {
        const [path, ...fragment] = line.split('#')
        return absolute(path).then((url) => [url, ...fragment].join('#'))
      }
      return raw
    }),
  )
  return lines.join('\n')
}

const BROWSER_UA = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 9.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const TS_PACKET = 188
const IMAGE_MAGIC = [[0x89, 0x50, 0x4e, 0x47], [0xff, 0xd8, 0xff], [0x47, 0x49, 0x46, 0x38], [0x42, 0x4d], [0x52, 0x49, 0x46, 0x46]]
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

const isImage = (bytes: Uint8Array) => IMAGE_MAGIC.some((magic) => magic.every((byte, i) => bytes[i] === byte))

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

function pass(reader: ReadableStreamDefaultReader<Uint8Array>, body: ReadableStream<Uint8Array>, head: Uint8Array): ReadableStream<Uint8Array> {
  const Identity = (globalThis as { IdentityTransformStream?: typeof TransformStream }).IdentityTransformStream ?? TransformStream
  const { readable, writable } = new Identity<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  void (async () => {
    if (head.length) await writer.write(head)
    writer.releaseLock()
    reader.releaseLock()
    await body.pipeTo(writable)
  })().catch(() => undefined)
  return readable
}

export async function proxy(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const encodedTarget = url.searchParams.get('u')
  const encodedReferer = url.searchParams.get('r')
  const signature = url.searchParams.get('s')
  if (!encodedTarget) return json({ error: 'missing u' }, 400)
  const trusted = !env.PROXY_SECRET || (!!signature && (await verify(env.PROXY_SECRET, encodedTarget, encodedReferer, signature)))
  if (signature && !trusted) return json({ error: 'bad signature' }, 403)
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
  const isHtml = (r: Response) => /text\/html/i.test(r.headers.get('content-type') ?? '')
  let upstream = await fetch(target, { headers })
  if (isHtml(upstream)) {
    await upstream.body?.cancel()
    upstream = await fetch(target, { headers })
  }
  if (isHtml(upstream)) {
    await upstream.body?.cancel()
    return json({ error: 'upstream returned html', status: upstream.status }, 502)
  }
  const outHeaders = new Headers({ ...cors, 'x-content-type-options': 'nosniff', 'content-security-policy': 'sandbox' })
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers.get(name)
    if (value) outHeaders.set(name, value)
  }
  if (!upstream.ok || !upstream.body) {
    if (trusted) return new Response(upstream.body, { status: upstream.status, headers: outHeaders })
    await upstream.body?.cancel()
    return new Response(null, { status: upstream.status, headers: cors })
  }
  const reader = upstream.body.getReader()
  const first = await readHead(reader)
  const opening = new TextDecoder().decode(first.slice(0, 32)).trimStart()
  const isPlaylist = opening.startsWith('#EXTM3U')
  const isVtt = opening.startsWith('WEBVTT')
  const isMp4 = /^video\/mp4/i.test(upstream.headers.get('content-type') ?? '')
  if (!isPlaylist && !isVtt && !isMp4 && !trusted) {
    await reader.cancel()
    return json({ error: 'unsigned' }, 403)
  }
  if (!isPlaylist && !isVtt) {
    const found = upstream.status === 200 ? tsStart(first) : -1
    const start = found === 0 || isImage(first) ? found : -1
    if (start < 0) return new Response(pass(reader, upstream.body, first), { status: upstream.status, headers: outHeaders })
    outHeaders.set('content-type', 'video/mp2t')
    const length = Number(outHeaders.get('content-length'))
    if (start > 0 && length) outHeaders.set('content-length', String(length - start))
    return new Response(pass(reader, upstream.body, first.subarray(start)), { status: upstream.status, headers: outHeaders })
  }
  const text = new TextDecoder().decode(await readAll(reader, first))
  outHeaders.delete('content-length')
  outHeaders.set('content-type', isVtt ? 'text/vtt; charset=utf-8' : 'application/vnd.apple.mpegurl')
  const body = await (isVtt ? rewriteVtt : rewritePlaylist)(isVtt ? text : pickAudio(text, url.searchParams.get('a')), upstream.url || target, `${url.origin}/proxy`, referer, env.PROXY_SECRET)
  return new Response(body, { status: upstream.status, headers: outHeaders })
}
