import { request } from '../../http'
import { sourceHost } from '../host'
import type { SourceAdapter } from '../types'
import { decodeCatalog } from './decode'
import { parseEpisodes, parseStreams, pickShow } from './parse'

const DEFAULT_HOST = 'https://www.miruro.to'

async function get(path: string, host = sourceHost('miruro', DEFAULT_HOST, '/x/miruro')): Promise<unknown> {
  return decodeCatalog(await request(`${host}/api/v1${path}`))
}

export const miruro: SourceAdapter = {
  id: 'miruro',
  name: 'Miruro',
  defaultHost: DEFAULT_HOST,
  async check(host) {
    try {
      const data = (await get('/anime?q=naruto&limit=5&sort=-popularity', host)) as { data?: unknown }
      return Array.isArray(data?.data)
    } catch {
      return false
    }
  },
  async resolve(media) {
    for (const title of media.titles) {
      const id = pickShow(await get(`/anime?q=${encodeURIComponent(title)}&limit=5&sort=-popularity`), media.anilistId)
      if (id) return { source: 'miruro', id }
    }
    return null
  },
  async episodes(show) {
    return parseEpisodes(await get(`/anime/${show.id}/episodes?kind=regular&limit=10000`))
  },
  async stream(show, ep, lang) {
    return parseStreams(await get(`/anime/${show.id}/episodes/${ep}/play`), lang)
  },
}
