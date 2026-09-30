export interface KVLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

export interface Env {
  PAIRS: KVLike
  ANILIST_CLIENT_ID: string
  ANILIST_CLIENT_SECRET: string
  MAL_CLIENT_ID: string
  MAL_CLIENT_SECRET: string
}

type Provider = 'anilist' | 'mal'

export interface Tokens {
  accessToken: string
  refreshToken?: string
  expiresAt: number
}

interface PairRecord {
  provider: Provider
  verifier?: string
  tokens?: Tokens
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PENDING_TTL = 600
const DONE_TTL = 300

export const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, range',
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: cors })
}

function randomString(length: number, alphabet: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

function isProvider(value: unknown): value is Provider {
  return value === 'anilist' || value === 'mal'
}

async function readPair(env: Env, code: string): Promise<PairRecord | null> {
  const raw = await env.PAIRS.get(`pair:${code}`)
  return raw ? (JSON.parse(raw) as PairRecord) : null
}

function toTokens(data: { access_token: string; refresh_token?: string; expires_in: number }): Tokens {
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 }
}

export async function createPair(req: Request, env: Env): Promise<Response> {
  const { provider } = (await req.json().catch(() => ({}))) as { provider?: unknown }
  if (!isProvider(provider)) return json({ error: 'unknown provider' }, 400)
  const code = randomString(6, CODE_ALPHABET)
  const record: PairRecord = { provider }
  if (provider === 'mal') record.verifier = randomString(64, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~')
  await env.PAIRS.put(`pair:${code}`, JSON.stringify(record), { expirationTtl: PENDING_TTL })
  const origin = new URL(req.url).origin
  return json({ code, pairUrl: `${origin}/login/${code}` })
}

export async function login(req: Request, env: Env, code: string): Promise<Response> {
  const record = await readPair(env, code)
  if (!record) return new Response('Code expired. Start again on the TV.', { status: 404 })
  const redirectUri = `${new URL(req.url).origin}/callback/${record.provider}`
  const url =
    record.provider === 'anilist'
      ? new URL('https://anilist.co/api/v2/oauth/authorize')
      : new URL('https://myanimelist.net/v1/oauth2/authorize')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', code)
  if (record.provider === 'anilist') {
    url.searchParams.set('client_id', env.ANILIST_CLIENT_ID)
  } else {
    url.searchParams.set('client_id', env.MAL_CLIENT_ID)
    url.searchParams.set('code_challenge', record.verifier!)
    url.searchParams.set('code_challenge_method', 'plain')
  }
  return Response.redirect(url.toString(), 302)
}

async function exchange(record: PairRecord, env: Env, oauthCode: string, redirectUri: string): Promise<{ tokens: Tokens } | { error: string }> {
  const res =
    record.provider === 'anilist'
      ? await fetch('https://anilist.co/api/v2/oauth/token', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: env.ANILIST_CLIENT_ID,
            client_secret: env.ANILIST_CLIENT_SECRET,
            redirect_uri: redirectUri,
            code: oauthCode,
          }),
        })
      : await fetch('https://myanimelist.net/v1/oauth2/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: env.MAL_CLIENT_ID,
            client_secret: env.MAL_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: oauthCode,
            code_verifier: record.verifier!,
            redirect_uri: redirectUri,
          }).toString(),
        })
  const text = await res.text()
  if (!res.ok) {
    const body = (() => {
      try {
        const data = JSON.parse(text) as { error?: string; hint?: string; message?: string }
        return [data.error, data.hint ?? data.message].filter(Boolean).join(' ')
      } catch {
        return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
      }
    })()
    return { error: `${res.status}: ${body}` }
  }
  return { tokens: toTokens(JSON.parse(text)) }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function page(message: string, status = 200): Response {
  const html = `<!doctype html><meta name="viewport" content="width=device-width"><body style="font:20px system-ui;padding:40px;background:#0b0d12;color:#f2f4f8">${message}</body>`
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

export async function callback(req: Request, env: Env, provider: string): Promise<Response> {
  const url = new URL(req.url)
  const code = url.searchParams.get('state') ?? ''
  const oauthCode = url.searchParams.get('code')
  const record = await readPair(env, code)
  if (!record || record.provider !== provider || !oauthCode) return page('Code expired. Start again on the TV.', 404)
  const result = await exchange(record, env, oauthCode, `${url.origin}/callback/${provider}`)
  if ('error' in result) {
    console.log(`exchange failed for ${provider}: ${result.error}`)
    return page(`Login failed. Start again on the TV.<p style="opacity:.6">${escapeHtml(result.error)}</p>`, 502)
  }
  await env.PAIRS.put(`pair:${code}`, JSON.stringify({ ...record, tokens: result.tokens }), { expirationTtl: DONE_TTL })
  return page('Done. Look at your TV.')
}

export async function poll(env: Env, code: string): Promise<Response> {
  const record = await readPair(env, code)
  if (!record) return json({ status: 'missing' }, 404)
  if (!record.tokens) return json({ status: 'pending' }, 202)
  await env.PAIRS.delete(`pair:${code}`)
  return json({ status: 'done', tokens: record.tokens })
}

export async function refreshMal(req: Request, env: Env): Promise<Response> {
  const { refreshToken } = (await req.json().catch(() => ({}))) as { refreshToken?: string }
  if (!refreshToken) return json({ error: 'missing refreshToken' }, 400)
  const res = await fetch('https://myanimelist.net/v1/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MAL_CLIENT_ID,
      client_secret: env.MAL_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  })
  if (res.status === 400 || res.status === 401) return json({ error: 'refresh rejected' }, 401)
  if (!res.ok) return json({ error: 'mal unavailable' }, 502)
  return json(toTokens(await res.json()))
}
