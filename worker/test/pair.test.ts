import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import type { Env } from '../src/pair'
import { memoryKV } from './kv'

const origin = 'https://auth.test'
let env: Env

function call(path: string, init?: RequestInit) {
  return worker.fetch(new Request(origin + path, init), env)
}

beforeEach(() => {
  env = { PAIRS: memoryKV(), ANILIST_CLIENT_ID: 'al-id', ANILIST_CLIENT_SECRET: 'al-secret', MAL_CLIENT_ID: 'mal-id', MAL_CLIENT_SECRET: 'mal-secret' }
})
afterEach(() => vi.unstubAllGlobals())

async function startPair(provider: string) {
  const res = await call('/pair', { method: 'POST', body: JSON.stringify({ provider }) })
  return (await res.json()) as { code: string; pairUrl: string }
}

describe('pairing', () => {
  it('creates a pending pair with a 6 character code', async () => {
    const { code, pairUrl } = await startPair('anilist')
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(pairUrl).toBe(`${origin}/login/${code}`)
    const poll = await call(`/pair/${code}`)
    expect(poll.status).toBe(202)
    expect(poll.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('rejects unknown providers', async () => {
    const res = await call('/pair', { method: 'POST', body: JSON.stringify({ provider: 'kitsu' }) })
    expect(res.status).toBe(400)
  })

  it('redirects login to AniList authorize with state', async () => {
    const { code } = await startPair('anilist')
    const res = await call(`/login/${code}`)
    expect(res.status).toBe(302)
    const url = new URL(res.headers.get('location')!)
    expect(url.origin + url.pathname).toBe('https://anilist.co/api/v2/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('al-id')
    expect(url.searchParams.get('redirect_uri')).toBe(`${origin}/callback/anilist`)
    expect(url.searchParams.get('state')).toBe(code)
  })

  it('redirects login to MAL with a plain PKCE challenge', async () => {
    const { code } = await startPair('mal')
    const url = new URL((await call(`/login/${code}`)).headers.get('location')!)
    expect(url.origin + url.pathname).toBe('https://myanimelist.net/v1/oauth2/authorize')
    expect(url.searchParams.get('code_challenge_method')).toBe('plain')
    expect(url.searchParams.get('code_challenge')!.length).toBeGreaterThanOrEqual(43)
  })

  it('exchanges the AniList code and hands tokens to the TV exactly once', async () => {
    const fetchMock = vi.fn(async () => Response.json({ access_token: 'AT', expires_in: 31536000 }))
    vi.stubGlobal('fetch', fetchMock)
    const { code } = await startPair('anilist')
    const cb = await call(`/callback/anilist?code=oauth-code&state=${code}`)
    expect(cb.status).toBe(200)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://anilist.co/api/v2/oauth/token')
    expect(JSON.parse(init.body as string)).toMatchObject({ grant_type: 'authorization_code', code: 'oauth-code', client_secret: 'al-secret' })
    const first = await call(`/pair/${code}`)
    expect(first.status).toBe(200)
    const body = (await first.json()) as { tokens: { accessToken: string; expiresAt: number } }
    expect(body.tokens.accessToken).toBe('AT')
    expect(body.tokens.expiresAt).toBeGreaterThan(Date.now())
    expect((await call(`/pair/${code}`)).status).toBe(404)
  })

  it('sends the MAL verifier during exchange', async () => {
    const fetchMock = vi.fn(async () => Response.json({ access_token: 'MT', refresh_token: 'MR', expires_in: 2678400 }))
    vi.stubGlobal('fetch', fetchMock)
    const { code } = await startPair('mal')
    const challenge = new URL((await call(`/login/${code}`)).headers.get('location')!).searchParams.get('code_challenge')
    await call(`/callback/mal?code=c&state=${code}`)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://myanimelist.net/v1/oauth2/token')
    const form = new URLSearchParams(init.body as string)
    expect(form.get('code_verifier')).toBe(challenge)
    expect(form.get('client_secret')).toBe('mal-secret')
  })

  it('returns 404 for a callback with an unknown state', async () => {
    expect((await call('/callback/anilist?code=c&state=NOPE22')).status).toBe(404)
  })

  it('refreshes MAL tokens', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ access_token: 'N', refresh_token: 'R2', expires_in: 100 })))
    const res = await call('/refresh/mal', { method: 'POST', body: JSON.stringify({ refreshToken: 'R1' }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ accessToken: 'N', refreshToken: 'R2' })
  })

  it('returns 401 when MAL refresh is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 400 })))
    const res = await call('/refresh/mal', { method: 'POST', body: JSON.stringify({ refreshToken: 'R1' }) })
    expect(res.status).toBe(401)
  })

  it('answers CORS preflight', async () => {
    const res = await call('/pair', { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
  })
})
