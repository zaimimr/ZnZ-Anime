import { afterEach, describe, expect, it, vi } from 'vitest'
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
  const out = rewritePlaylist(body, 'https://cdn.test/show/ep1/index.m3u8', 'https://auth.test/proxy', 'https://kwik.cx/').split('\n')

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
})
