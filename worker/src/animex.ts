import { cors } from './pair'

const API = 'https://pp.animex.one/rest/api'
const GRAPHQL = 'https://graphql.animex.one/graphql'

export async function animex(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname.slice('/animex'.length)
  const init: RequestInit = { headers: { origin: 'https://animex.one', 'user-agent': 'Mozilla/5.0', 'content-type': 'application/json' } }
  const upstream = path === '/graphql'
    ? await fetch(GRAPHQL, { ...init, method: 'POST', body: await req.text() })
    : await fetch(`${API}${path}${url.search}`, init)
  const headers = new Headers(cors)
  headers.set('content-type', upstream.headers.get('content-type') ?? 'application/json')
  return new Response(upstream.body, { status: upstream.status, headers })
}
