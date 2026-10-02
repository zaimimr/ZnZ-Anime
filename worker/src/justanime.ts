import { cors } from './pair'

const API = 'https://core.justanime.to/api'

export async function justanime(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const upstream = await fetch(`${API}${url.pathname.slice('/justanime'.length)}${url.search}`, { headers: { origin: 'https://justanime.to', 'user-agent': 'Mozilla/5.0' } })
  const headers = new Headers(cors)
  headers.set('content-type', upstream.headers.get('content-type') ?? 'application/json')
  return new Response(upstream.body, { status: upstream.status, headers })
}
