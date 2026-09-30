import type { Airing, Card, Change, ListItem, Status } from '../types'
import { gql } from './client'

interface MediaNode {
  id: number
  idMal: number | null
  title: { romaji: string | null; english: string | null; native: string | null }
  coverImage: { large: string }
  episodes: number | null
}

export interface Related extends Card {
  relation: string
}

export interface Details extends Card {
  description: string
  related: Related[]
  recommended: Card[]
  listId?: number
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

const relationLabels: Record<string, string> = { PREQUEL: 'Prequel', SEQUEL: 'Sequel', PARENT: 'Main story', SIDE_STORY: 'Side story' }

type RelationEdge = { relationType: string; node: MediaNode & { type: string; startDate: { year: number | null; month: number | null; day: number | null } } }

export function toRelated(edges: RelationEdge[]): Related[] {
  const start = (e: RelationEdge) => { const d = e.node.startDate; return (d.year ?? 9999) * 10000 + (d.month ?? 12) * 100 + (d.day ?? 31) }
  return edges
    .filter((e) => e.node.type === 'ANIME' && relationLabels[e.relationType])
    .sort((a, b) => start(a) - start(b))
    .map((e) => ({ ...toCard(e.node), relation: relationLabels[e.relationType] }))
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
  const data = await gql<{ MediaListCollection: { lists: { entries: { id: number; mediaId: number; status: string; progress: number; score: number; updatedAt: number; media: MediaNode & { status?: string; nextAiringEpisode?: { episode: number; airingAt: number } | null } }[] }[] } }>(
    `query ($userId: Int) { MediaListCollection(userId: $userId, type: ANIME) { lists { entries { id mediaId status progress score(format: POINT_10) updatedAt media { ${CARD} status nextAiringEpisode { episode airingAt } } } } } }`,
    { userId: id },
  )
  return data.MediaListCollection.lists.flatMap((list) =>
    list.entries.map((e) => {
      const card = toCard(e.media)
      const next = e.media.nextAiringEpisode
      return {
        card,
        listId: e.id,
        aired: next ? next.episode - 1 : e.media.status === 'FINISHED' ? card.episodes : undefined,
        ...(next ? { nextAiring: { episode: next.episode, at: next.airingAt * 1000 } } : {}),
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

export async function deleteEntry(listId: number): Promise<void> {
  await gql('mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }', { id: listId })
}

export interface ScheduleItem {
  card: Card
  airing: Airing
}

export async function schedule(mediaIds: number[], from: number, to: number): Promise<ScheduleItem[]> {
  if (!mediaIds.length) return []
  const data = await gql<{ Page: { airingSchedules: { episode: number; airingAt: number; media: MediaNode }[] } }>(
    `query ($ids: [Int], $from: Int, $to: Int) { Page(perPage: 50) { airingSchedules(mediaId_in: $ids, airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) { episode airingAt media { ${CARD} } } } }`,
    { ids: mediaIds, from: Math.floor(from / 1000), to: Math.floor(to / 1000) },
  )
  return data.Page.airingSchedules.map((s) => ({ card: toCard(s.media), airing: { episode: s.episode, at: s.airingAt * 1000 } }))
}

export async function recommendations(id: number): Promise<Card[]> {
  const data = await gql<{ Media: { recommendations: { nodes: { mediaRecommendation: MediaNode | null }[] } } }>(
    `query ($id: Int) { Media(id: $id) { recommendations(sort: RATING_DESC, perPage: 15) { nodes { mediaRecommendation { ${CARD} } } } } }`,
    { id },
  )
  return data.Media.recommendations.nodes.map((n) => n.mediaRecommendation).filter((m): m is MediaNode => Boolean(m)).map(toCard)
}

export async function search(q: string): Promise<Card[]> {
  const data = await gql<{ Page: { media: MediaNode[] } }>(
    `query ($q: String) { Page(perPage: 30) { media(search: $q, type: ANIME, isAdult: false, sort: SEARCH_MATCH) { ${CARD} } } }`,
    { q },
  )
  return data.Page.media.map(toCard)
}

export async function details(id: number): Promise<Details> {
  const data = await gql<{ Media: MediaNode & { description: string | null; bannerImage: string | null; status: string; nextAiringEpisode: { episode: number } | null; mediaListEntry: { id: number; status: string; progress: number; score: number } | null; recommendations?: { nodes: { mediaRecommendation: MediaNode | null }[] }; relations: { edges: RelationEdge[] } } }>(
    `query ($id: Int) { Media(id: $id) { ${CARD} description(asHtml: false) bannerImage status nextAiringEpisode { episode } mediaListEntry { id status progress score(format: POINT_10) } recommendations(sort: RATING_DESC, perPage: 15) { nodes { mediaRecommendation { ${CARD} } } } relations { edges { relationType node { ${CARD} type startDate { year month day } } } } } }`,
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
    related: toRelated(m.relations?.edges ?? []),
    recommended: (m.recommendations?.nodes ?? []).map((n) => n.mediaRecommendation).filter((r): r is MediaNode => Boolean(r)).map(toCard),
    listId: m.mediaListEntry?.id,
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

export interface TrendItem {
  card: Card
  history: { date: number; trending: number }[]
}

export async function trendingWithHistory(page: number): Promise<{ items: TrendItem[]; hasNext: boolean }> {
  const data = await gql<{ Page: { pageInfo: { hasNextPage: boolean }; media: (MediaNode & { trends: { nodes: { date: number; trending: number }[] } })[] } }>(
    `query ($page: Int) { Page(page: $page, perPage: 50) { pageInfo { hasNextPage } media(type: ANIME, isAdult: false, sort: TRENDING_DESC) { ${CARD} trends(sort: DATE_DESC, perPage: 30) { nodes { date trending } } } } }`,
    { page },
    false,
  )
  return {
    items: data.Page.media.map((m) => ({ card: toCard(m), history: m.trends.nodes })),
    hasNext: data.Page.pageInfo.hasNextPage,
  }
}
