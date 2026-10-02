import { anilistCallbackPage, callback, cors, createPair, type Env, json, limited, login, poll, refreshMal, saveAnilistToken } from './pair'
import { justanime } from './justanime'
import { proxy } from './proxy'

async function route(req: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(req.url)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method === 'POST' && pathname === '/pair') return (await limited(env.PAIR_LIMIT, req)) ? json({ error: 'slow down' }, 429) : createPair(req, env)
  if (req.method === 'POST' && pathname === '/refresh/mal') return refreshMal(req, env)
  if (req.method === 'POST' && pathname === '/callback/anilist/token') return saveAnilistToken(req, env)
  if (req.method === 'GET' && pathname === '/callback/anilist') return anilistCallbackPage()
  if (req.method === 'GET' && pathname === '/proxy') return proxy(req, env)
  if (req.method === 'GET' && pathname.startsWith('/justanime/')) return justanime(req)
  const [, head, param] = pathname.split('/')
  if (req.method === 'GET' && head === 'pair' && param) return (await limited(env.POLL_LIMIT, req)) ? json({ error: 'slow down' }, 429) : poll(env, param)
  if (req.method === 'GET' && head === 'login' && param) return login(req, env, param)
  if (req.method === 'GET' && head === 'callback' && param) return callback(req, env, param)
  return json({ error: 'not found' }, 404)
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env)
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 502)
    }
  },
}
