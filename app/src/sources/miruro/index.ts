import { hosts } from '../../hosts'
import { request } from '../../http'
import type { SourceAdapter } from '../types'
import { decodeCatalog } from './decode'
import { parseEpisodes, parseStreams, pickShow } from './parse'

async function get(path: string): Promise<unknown> {
  return decodeCatalog(await request(`${hosts.miruro}/api/v1${path}`))
}

export const miruro: SourceAdapter = {
  id: 'miruro',
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
