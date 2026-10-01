import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { b64urlDecode, b64urlEncode } from '../src/b64'
import { rewritePlaylist } from '../src/proxy'
import { memoryKV } from './kv'

const env = { PAIRS: memoryKV(), ANILIST_CLIENT_ID: '', MAL_CLIENT_ID: '', MAL_CLIENT_SECRET: '' }
afterEach(() => vi.unstubAllGlobals())

function target(line: string) {
  const url = new URL(line)
  return { u: b64urlDecode(url.searchParams.get('u')!), r: url.searchParams.get('r') && b64urlDecode(url.searchParams.get('r')!) }
}

describe('rewritePlaylist', () => {
  const body = ['#EXTM3U', '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"', '#EXTINF:4.0,', 'seg-1.ts', '', '#EXTINF:4.0,', 'https://cdn.test/abs/seg-2.ts'].join('\n')
  let out: string[]
  beforeAll(async () => {
    out = (await rewritePlaylist(body, 'https://cdn.test/show/ep1/index.m3u8', 'https://auth.test/proxy', 'https://kwik.cx/')).split('\n')
  })

  it('keeps tags and blank lines', () => {
    expect(out[0]).toBe('#EXTM3U')
    expect(out[2]).toBe('#EXTINF:4.0,')
    expect(out[4]).toBe('')
  })

  it('resolves relative segment URLs and routes them through the proxy', () => {
    expect(target(out[3])).toEqual({ u: 'https://cdn.test/show/ep1/seg-1.ts', r: 'https://kwik.cx/' })
    expect(target(out[6]).u).toBe('https://cdn.test/abs/seg-2.ts')
  })

  it('rewrites URI attributes inside tags', () => {
    const uri = out[1].match(/URI="([^"]+)"/)![1]
    expect(target(uri).u).toBe('https://cdn.test/show/ep1/key.bin')
  })

  it('leaves non-http schemes alone', async () => {
    const pl = ['#EXTM3U', '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://key-id"', 'data:video/mp2t;base64,AAAA'].join('\n')
    const lines = (await rewritePlaylist(pl, 'https://cdn.test/a/pl.m3u8', 'https://auth.test/proxy')).split('\n')
    expect(lines[1]).toBe('#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://key-id"')
    expect(lines[2]).toBe('data:video/mp2t;base64,AAAA')
  })
})

describe('/proxy', () => {
  it('fetches upstream with the referer and rewrites playlists', async () => {
    const fetchMock = vi.fn(async () => new Response('#EXTM3U\nseg.ts\n', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } }))
    vi.stubGlobal('fetch', fetchMock)
    const u = b64urlEncode('https://cdn.test/a/pl.m3u8')
    const r = b64urlEncode('https://kwik.cx/')
    const res = await worker.fetch(new Request(`https://auth.test/proxy?u=${u}&r=${r}`), env)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://cdn.test/a/pl.m3u8')
    expect(new Headers(init.headers).get('referer')).toBe('https://kwik.cx/')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    const lines = (await res.text()).split('\n')
    expect(target(lines[1]).u).toBe('https://cdn.test/a/seg.ts')
  })

  it('passes binary segments through untouched and forwards range', async () => {
    const bytes = new Uint8Array([0x47, 1, 2, 3])
    const fetchMock = vi.fn(async () => new Response(bytes, { status: 206, headers: { 'content-type': 'video/mp2t' } }))
    vi.stubGlobal('fetch', fetchMock)
    const u = b64urlEncode('https://cdn.test/a/seg.ts')
    const res = await worker.fetch(new Request(`https://auth.test/proxy?u=${u}`, { headers: { range: 'bytes=0-3' } }), env)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(new Headers(init.headers).get('range')).toBe('bytes=0-3')
    expect(res.status).toBe(206)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)
  })

  it('forwards the client user agent and falls back to a browser one', async () => {
    const fetchMock = vi.fn(async () => new Response('x', { headers: { 'content-type': 'video/mp2t' } }))
    vi.stubGlobal('fetch', fetchMock)
    const u = b64urlEncode('https://cdn.test/a/seg.ts')
    await worker.fetch(new Request(`https://auth.test/proxy?u=${u}`, { headers: { 'user-agent': 'TizenTV/9' } }), env)
    await worker.fetch(new Request(`https://auth.test/proxy?u=${u}`), env)
    const agent = (i: number) => new Headers((fetchMock.mock.calls[i] as unknown as [string, RequestInit])[1].headers).get('user-agent')
    expect(agent(0)).toBe('TizenTV/9')
    expect(agent(1)).toMatch(/Mozilla\/5\.0/)
  })

  it('rewrites playlists disguised as images without an m3u8 extension', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('#EXTM3U\n/cdn/seg-1\n', { headers: { 'content-type': 'image/jpeg' } })))
    const u = b64urlEncode('https://px.test/cdn/abc')
    const res = await worker.fetch(new Request(`https://auth.test/proxy?u=${u}`), env)
    expect(res.headers.get('content-type')).toBe('application/vnd.apple.mpegurl')
    expect(target((await res.text()).split('\n')[1]).u).toBe('https://px.test/cdn/seg-1')
  })

  it('passes image-typed binary segments through untouched', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0x47, 0x40, 0x11])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'image/jpeg' } })))
    const u = b64urlEncode('https://px.test/cdn/seg-1')
    const res = await worker.fetch(new Request(`https://auth.test/proxy?u=${u}`), env)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)
  })

  it('refuses to relay html pages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>phish</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } })))
    const u = b64urlEncode('https://evil.test/page')
    const res = await worker.fetch(new Request(`https://auth.test/proxy?u=${u}`), env)
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('phish')
  })

  it('marks proxied responses as sandboxed and not sniffable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { headers: { 'content-type': 'video/mp2t' } })))
    const u = b64urlEncode('https://cdn.test/a/seg.ts')
    const res = await worker.fetch(new Request(`https://auth.test/proxy?u=${u}`), env)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBe('sandbox')
  })

  it('rejects missing or non-http targets', async () => {
    expect((await worker.fetch(new Request('https://auth.test/proxy'), env)).status).toBe(400)
    const u = b64urlEncode('file:///etc/passwd')
    expect((await worker.fetch(new Request(`https://auth.test/proxy?u=${u}`), env)).status).toBe(400)
  })

  it('strips a fake image header from video segments and labels them as video', async () => {
    const packet = (n: number) => { const p = new Uint8Array(188).fill(n); p[0] = 0x47; return p }
    const video = new Uint8Array([...packet(1), ...packet(2), ...packet(3)])
    const fake = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x47, 0, 0, 0])
    const body = new Uint8Array([...fake, ...video])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { headers: { 'content-type': 'image/png', 'content-length': String(body.length) } })))
    const u = b64urlEncode('https://cdn.test/a/seg')
    const res = await worker.fetch(new Request(`https://auth.test/proxy?u=${u}`), env)
    expect(res.headers.get('content-type')).toBe('video/mp2t')
    expect(res.headers.get('content-length')).toBe(String(video.length))
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(video)
  })

  it('labels plain ts segments as video', async () => {
    const packet = (n: number) => { const p = new Uint8Array(188).fill(n); p[0] = 0x47; return p }
    const video = new Uint8Array([...packet(1), ...packet(2), ...packet(3)])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(video, { headers: { 'content-type': 'application/octet-stream' } })))
    const u = b64urlEncode('https://cdn.test/a/seg')
    const res = await worker.fetch(new Request(`https://auth.test/proxy?u=${u}`), env)
    expect(res.headers.get('content-type')).toBe('video/mp2t')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(video)
  })

  it('only strips leading bytes that look like an image header', async () => {
    const packet = (n: number) => { const p = new Uint8Array(188).fill(n); p[0] = 0x47; return p }
    const body = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, ...packet(1), ...packet(2), ...packet(3)])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { headers: { 'content-type': 'video/mp4' } })))
    const res = await worker.fetch(new Request(`https://auth.test/proxy?u=${b64urlEncode('https://cdn.test/a/seg')}`), env)
    expect(res.headers.get('content-type')).toBe('video/mp4')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(body)
  })

  it('resolves playlist entries against the final URL after redirects', async () => {
    const upstream = new Response('#EXTM3U\nseg.ts\n', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } })
    Object.defineProperty(upstream, 'url', { value: 'https://edge.test/real/pl.m3u8' })
    vi.stubGlobal('fetch', vi.fn(async () => upstream))
    const res = await worker.fetch(new Request(`https://auth.test/proxy?u=${b64urlEncode('https://cdn.test/a/pl.m3u8')}`), env)
    expect(target((await res.text()).split('\n')[1]).u).toBe('https://edge.test/real/seg.ts')
  })

  it('returns 502 with CORS for a malformed target', async () => {
    const res = await worker.fetch(new Request('https://auth.test/proxy?u=%%%'), env)
    expect(res.status).toBe(502)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('asks again once when upstream answers with a web page', async () => {
    const page = new Response('<html>', { status: 403, headers: { 'content-type': 'text/html' } })
    const cancel = vi.spyOn(page.body!, 'cancel')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/jpeg' } }))
    vi.stubGlobal('fetch', fetchMock)
    const u = b64urlEncode('https://cdn.test/a/seg')
    const res = await worker.fetch(new Request(`https://auth.test/proxy?u=${u}`), env)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(cancel).toHaveBeenCalled()
    expect(res.status).toBe(200)
  })
})

describe('/proxy with PROXY_SECRET', () => {
  const secured = { ...env, PROXY_SECRET: 'test-secret' }
  const playlist = () => new Response('\uFEFF #EXTM3U\nseg.ts\n#EXT-X-KEY:METHOD=AES-128,URI="k.bin"\n', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } })

  async function signedLines() {
    vi.stubGlobal('fetch', vi.fn(async () => playlist()))
    const res = await worker.fetch(new Request(`https://auth.test/proxy?u=${b64urlEncode('https://cdn.test/a/pl.m3u8')}&r=${b64urlEncode('https://kwik.cx/')}`), secured)
    expect(res.status).toBe(200)
    return (await res.text()).split('\n')
  }

  it('serves unsigned playlists and signs every URL it emits', async () => {
    const lines = await signedLines()
    expect(new URL(lines[1]).searchParams.get('s')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(new URL(lines[2].match(/URI="([^"]+)"/)![1]).searchParams.get('s')).toBeTruthy()
  })

  it('serves anything with a valid signature', async () => {
    const segment = (await signedLines())[1]
    const bytes = new Uint8Array([1, 2, 3])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'video/mp2t' } })))
    const res = await worker.fetch(new Request(segment), secured)
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)
  })

  it('refuses unsigned non-playlists and tampered signatures', async () => {
    const segment = new URL((await signedLines())[1])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'video/mp2t' } })))
    const unsigned = new URL(segment)
    unsigned.searchParams.delete('s')
    expect((await worker.fetch(new Request(unsigned), secured)).status).toBe(403)
    const tampered = new URL(segment)
    tampered.searchParams.set('u', b64urlEncode('https://evil.test/x'))
    expect((await worker.fetch(new Request(tampered), secured)).status).toBe(403)
    const noReferer = new URL(segment)
    noReferer.searchParams.delete('r')
    expect((await worker.fetch(new Request(noReferer), secured)).status).toBe(403)
  })

  it('serves unsigned WEBVTT and signs thumbnail sprite URLs but not subtitle text', async () => {
    const vtt = ['\uFEFFWEBVTT', '', 'NOTE see sprite.jpg', '', '1', '00:00.000 --> 00:05.000', 'sprites/a.jpg#xywh=0,0,160,90', '', '00:05.000 --> 00:10.000', 'Hello there.', 'Bye', '', '00:10.000 --> 00:15.000', 'https://img.test/b.png'].join('\n')
    const upstream = new Response(vtt, { headers: { 'content-type': 'text/vtt' } })
    Object.defineProperty(upstream, 'url', { value: 'https://cdn.test/thumbs/list.vtt' })
    vi.stubGlobal('fetch', vi.fn(async () => upstream))
    const res = await worker.fetch(new Request(`https://auth.test/proxy?u=${b64urlEncode('https://cdn.test/t.vtt')}&r=${b64urlEncode('https://kwik.cx/')}`), secured)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/vtt')
    const lines = (await res.text()).split('\n')
    expect(lines[2]).toBe('NOTE see sprite.jpg')
    const [sprite, fragment] = lines[6].split('#')
    expect(fragment).toBe('xywh=0,0,160,90')
    expect(target(sprite)).toEqual({ u: 'https://cdn.test/thumbs/sprites/a.jpg', r: 'https://kwik.cx/' })
    expect(lines.slice(9, 11)).toEqual(['Hello there.', 'Bye'])
    expect(target(lines[13]).u).toBe('https://img.test/b.png')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0]), { headers: { 'content-type': 'image/jpeg' } })))
    expect((await worker.fetch(new Request(sprite), secured)).status).toBe(200)
    const unsigned = new URL(sprite)
    unsigned.searchParams.delete('s')
    expect((await worker.fetch(new Request(unsigned), secured)).status).toBe(403)
  })

  it('streams unsigned mp4 responses', async () => {
    const bytes = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { status: 206, headers: { 'content-type': 'video/mp4' } })))
    const res = await worker.fetch(new Request(`https://auth.test/proxy?u=${b64urlEncode('https://cdn.test/a.mp4')}`, { headers: { range: 'bytes=0-7' } }), secured)
    expect(res.status).toBe(206)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)
  })

  it('does not relay unsigned upstream error bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('secret page', { status: 404, headers: { 'content-type': 'text/plain' } })))
    const res = await worker.fetch(new Request(`https://auth.test/proxy?u=${b64urlEncode('https://cdn.test/x')}`), secured)
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('')
  })
})
