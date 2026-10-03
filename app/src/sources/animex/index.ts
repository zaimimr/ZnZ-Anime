import { request } from '../../http'
import { hosts } from '../../hosts'
import { sourceHost } from '../host'
import type { SourceAdapter } from '../types'
import { parseEpisodes, parseSources, providerIds } from './parse'

const host = () => sourceHost('animex', animex.defaultHost, '/x/animex')

async function get(path: string, base = host()): Promise<any> {
  return (await request(`${base}${path}`)).json()
}

const query = 'query($anilistId:Int){anime(anilistId:$anilistId){id}}'

export const animex: SourceAdapter = {
  id: 'animex',
  name: 'AnimeX',
  get defaultHost() {
    return `${hosts.auth}/animex`
  },
  async check(base) {
    try {
      return Array.isArray(await get('/episodes?id=one-piece-p8k27', base))
    } catch {
      return false
    }
  },
  async resolve(media) {
    const res = await request(`${host()}/graphql`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables: { anilistId: media.anilistId } }) })
    const id = ((await res.json()) as { data?: { anime?: { id?: string } } })?.data?.anime?.id
    return id ? { source: 'animex', id } : null
  },
  async episodes(show) {
    return parseEpisodes(await get(`/episodes?id=${encodeURIComponent(show.id)}`))
  },
  async stream(show, ep, lang) {
    const id = encodeURIComponent(show.id)
    const providers = providerIds(await get(`/servers?id=${id}&epNum=${ep}`), lang)
    const results = await Promise.allSettled(providers.map(async (p) => parseSources(p, await get(`/sources?id=${id}&epNum=${ep}&type=${lang}&providerId=${p}`))))
    return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  },
}
