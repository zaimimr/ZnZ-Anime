import type { Card, Change, ListItem, Status } from '../types'
import { gql } from './client'

interface MediaNode {
  id: number
  idMal: number | null
  title: { romaji: string | null; english: string | null; native: string | null }
  coverImage: { large: string }
  episodes: number | null
}

export interface Details extends Card {
  description: string
  banner?: string
  status: string
  nextEpisode?: number
  listStatus?: Status
  progress: number
  score: number
}

const CARD = 'id idMal title { romaji english native } coverImage { large } episodes'

const toAnilist: Record<Status, string> = { watching: 'CURRENT', completed: 'COMPLETED', paused: 'PAUSED', dropped: 'DROPPED', planning: 'PLANNING' }

export function toStatus(value: string): Status {
  if (value === 'CURRENT' || value === 'REPEATING') return 'watching'
  return (Object.keys(toAnilist) as Status[]).find((s) => toAnilist[s] === value) ?? 'planning'
}

export function fromStatus(status: Status): string {
  return toAnilist[status]
}

function toCard(m: MediaNode): Card {
  const titles = [m.title.romaji, m.title.english, m.title.native].filter((t): t is string => Boolean(t))
  return { id: m.id, idMal: m.idMal ?? undefined, title: m.title.english ?? m.title.romaji ?? titles[0] ?? '', titles, cover: m.coverImage.large, episodes: m.episodes ?? undefined }
}

export async function viewer(): Promise<{ id: number; name: string }> {
  const data = await gql<{ Viewer: { id: number; name: string } }>('query { Viewer { id name } }')
  return data.Viewer
}

export async function fetchList(): Promise<ListItem[]> {
  const { id } = await viewer()
  const data = await gql<{ MediaListCollection: { lists: { entries: { mediaId: number; status: string; progress: number; score: number; updatedAt: number; media: MediaNode }[] }[] } }>(
    `query ($userId: Int) { MediaListCollection(userId: $userId, type: ANIME) { lists { entries { mediaId status progress score(format: POINT_10) updatedAt media { ${CARD} } } } } }`,
    { userId: id },
  )
  return data.MediaListCollection.lists.flatMap((list) =>
    list.entries.map((e) => {
      const card = toCard(e.media)
      return {
        card,
        updatedAt: e.updatedAt * 1000,
        entry: { anilistId: e.mediaId, malId: card.idMal, title: card.title, status: toStatus(e.status), progress: e.progress, score: e.score },
      }
    }),
  )
}

export async function saveEntry(change: Change): Promise<void> {
  await gql(
    'mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $scoreRaw: Int) { SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, scoreRaw: $scoreRaw) { id } }',
    { mediaId: change.anilistId, status: fromStatus(change.status), progress: change.progress, scoreRaw: Math.round(change.score * 10) },
  )
}

export async function search(q: string): Promise<Card[]> {
  const data = await gql<{ Page: { media: MediaNode[] } }>(
    `query ($q: String) { Page(perPage: 30) { media(search: $q, type: ANIME, isAdult: false, sort: SEARCH_MATCH) { ${CARD} } } }`,
    { q },
  )
  return data.Page.media.map(toCard)
}

export async function details(id: number): Promise<Details> {
  const data = await gql<{ Media: MediaNode & { description: string | null; bannerImage: string | null; status: string; nextAiringEpisode: { episode: number } | null; mediaListEntry: { status: string; progress: number; score: number } | null } }>(
    `query ($id: Int) { Media(id: $id) { ${CARD} description(asHtml: false) bannerImage status nextAiringEpisode { episode } mediaListEntry { status progress score(format: POINT_10) } } }`,
    { id },
  )
  const m = data.Media
  return {
    ...toCard(m),
    description: (m.description ?? '').replace(/<[^>]+>/g, ''),
    banner: m.bannerImage ?? undefined,
    status: m.status,
    nextEpisode: m.nextAiringEpisode?.episode,
    listStatus: m.mediaListEntry ? toStatus(m.mediaListEntry.status) : undefined,
    progress: m.mediaListEntry?.progress ?? 0,
    score: m.mediaListEntry?.score ?? 0,
  }
}

function currentSeason(date = new Date()): { season: string; year: number } {
  const seasons = ['WINTER', 'WINTER', 'WINTER', 'SPRING', 'SPRING', 'SPRING', 'SUMMER', 'SUMMER', 'SUMMER', 'FALL', 'FALL', 'FALL']
  return { season: seasons[date.getMonth()], year: date.getFullYear() }
}

export async function season(): Promise<Card[]> {
  const { season: s, year } = currentSeason()
  const data = await gql<{ Page: { media: MediaNode[] } }>(
    `query ($season: MediaSeason, $year: Int) { Page(perPage: 30) { media(season: $season, seasonYear: $year, type: ANIME, isAdult: false, sort: POPULARITY_DESC) { ${CARD} } } }`,
    { season: s, year },
  )
  return data.Page.media.map(toCard)
}

export async function mediaByIds(ids: number[]): Promise<Card[]> {
  if (!ids.length) return []
  const data = await gql<{ Page: { media: MediaNode[] } }>(`query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { ${CARD} } } }`, { ids })
  const byId = new Map(data.Page.media.map((m) => [m.id, toCard(m)]))
  return ids.map((id) => byId.get(id)).filter((c): c is Card => Boolean(c))
}

export async function anilistIdsForMal(malIds: number[]): Promise<Map<number, number>> {
  const result = new Map<number, number>()
  for (let i = 0; i < malIds.length; i += 50) {
    const chunk = malIds.slice(i, i + 50)
    const data = await gql<{ Page: { media: { id: number; idMal: number }[] } }>('query ($ids: [Int]) { Page(perPage: 50) { media(idMal_in: $ids, type: ANIME) { id idMal } } }', { ids: chunk })
    for (const m of data.Page.media) result.set(m.idMal, m.id)
  }
  return result
}

export async function trendsPage(since: number, page: number): Promise<{ rows: { mediaId: number; trending: number }[]; hasNext: boolean }> {
  const data = await gql<{ Page: { pageInfo: { hasNextPage: boolean }; mediaTrends: { mediaId: number; trending: number; media: { type: string; isAdult: boolean } }[] } }>(
    'query ($since: Int, $page: Int) { Page(page: $page, perPage: 50) { pageInfo { hasNextPage } mediaTrends(date_greater: $since, sort: TRENDING_DESC) { mediaId trending media { type isAdult } } } }',
    { since, page },
    false,
  )
  return {
    rows: data.Page.mediaTrends.filter((t) => t.media.type === 'ANIME' && !t.media.isAdult).map(({ mediaId, trending }) => ({ mediaId, trending })),
    hasNext: data.Page.pageInfo.hasNextPage,
  }
}
