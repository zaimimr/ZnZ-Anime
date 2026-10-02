import { HttpError, request } from '../../http'
import { hosts } from '../../hosts'
import { sourceHost } from '../host'
import type { SourceAdapter } from '../types'
import { availableServers, parseEpisodes, parseServer } from './parse'

async function get(path: string, host = sourceHost('justanime', justanime.defaultHost, '/x/justanime')): Promise<any> {
  return (await request(`${host}${path}`)).json()
}

const missing = (e: unknown) => {
  if (e instanceof HttpError && e.status === 404) return { episodes: [] }
  throw e
}

export const justanime: SourceAdapter = {
  id: 'justanime',
  name: 'JustAnime',
  get defaultHost() {
    return `${hosts.auth}/justanime`
  },
  async check(host) {
    try {
      return Array.isArray((await get('/anime/1/episodes?page=1', host))?.episodes)
    } catch {
      return false
    }
  },
  async resolve(media) {
    return { source: 'justanime', id: String(media.anilistId) }
  },
  async episodes(show) {
    const first = await get(`/anime/${show.id}/episodes?page=1`).catch(missing)
    const pages = Math.max(0, (Number(first.totalPages) || 1) - 1)
    const rest = await Promise.all(Array.from({ length: pages }, (_, i) => get(`/anime/${show.id}/episodes?page=${i + 2}`)))
    return parseEpisodes([first, ...rest])
  },
  async stream(show, ep, lang) {
    const base = `/watch/${show.id}/episode/${ep}`
    const names = availableServers(await get(`${base}/servers`), lang)
    const results = await Promise.allSettled(names.map(async (name) => parseServer(name, await get(`${base}/${name}`), lang)))
    return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  },
}
