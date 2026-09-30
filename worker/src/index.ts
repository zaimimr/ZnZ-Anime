import { callback, cors, createPair, type Env, json, login, poll, refreshMal } from './pair'
import { proxy } from './proxy'

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method === 'POST' && pathname === '/pair') return createPair(req, env)
    if (req.method === 'POST' && pathname === '/refresh/mal') return refreshMal(req, env)
    if (req.method === 'GET' && pathname === '/proxy') return proxy(req)
    const [, head, param] = pathname.split('/')
    if (req.method === 'GET' && head === 'pair' && param) return poll(env, param)
    if (req.method === 'GET' && head === 'login' && param) return login(req, env, param)
    if (req.method === 'GET' && head === 'callback' && param) return callback(req, env, param)
    return json({ error: 'not found' }, 404)
  },
}
