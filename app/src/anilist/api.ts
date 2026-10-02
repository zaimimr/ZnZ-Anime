import type { Airing, Card, Change, ListEntry, ListItem, Status } from '../types'
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
  released: boolean
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

const toAnilist: Record<Status, string> = { watching: 'CURRENT', rewatching: 'REPEATING', completed: 'COMPLETED', paused: 'PAUSED', dropped: 'DROPPED', planning: 'PLANNING' }

export function toStatus(value: string): Status {
  return (Object.keys(toAnilist) as Status[]).find((s) => toAnilist[s] === value) ?? 'planning'
}

export function fromStatus(status: Status): string {
  return toAnilist[status]
}

const relationLabels: Record<string, string> = { PREQUEL: 'Prequel', SEQUEL: 'Sequel', PARENT: 'Main story', SIDE_STORY: 'Side story' }

type RelationEdge = { relationType: string; node: MediaNode & { type: string; status?: string; startDate: { year: number | null; month: number | null; day: number | null } } }

export function toRelated(edges: RelationEdge[]): Related[] {
  const start = (e: RelationEdge) => { const d = e.node.startDate; return (d.year ?? 9999) * 10000 + (d.month ?? 12) * 100 + (d.day ?? 31) }
  return edges
    .filter((e) => e.node.type === 'ANIME' && relationLabels[e.relationType])
    .sort((a, b) => start(a) - start(b))
    .map((e) => ({ ...toCard(e.node), relation: relationLabels[e.relationType], released: e.node.status !== 'NOT_YET_RELEASED' }))
}

function toCard(m: MediaNode): Card {
  const titles = [m.title.romaji, m.title.english, m.title.native].filter((t): t is string => Boolean(t))
  return { id: m.id, idMal: m.idMal ?? undefined, title: m.title.english ?? m.title.romaji ?? titles[0] ?? '', titles, cover: m.coverImage.large, episodes: m.episodes ?? undefined }
}

export async function viewer(): Promise<{ id: number; name: string }> {
  const data = await gql<{ Viewer: { id: number; name: string } }>('query { Viewer { id name } }')
  return data.Viewer
}

type ListMedia = MediaNode & { status?: string; nextAiringEpisode?: { episode: number; airingAt: number } | null }

export function toListItem(media: ListMedia, entry: Omit<ListEntry, 'anilistId' | 'malId' | 'title'>, updatedAt: number, listId?: number): ListItem {
  const card = toCard(media)
  const next = media.nextAiringEpisode
  return {
    card,
    ...(listId ? { listId } : {}),
    aired: next ? next.episode - 1 : media.status === 'FINISHED' ? card.episodes : undefined,
    ...(next ? { nextAiring: { episode: next.episode, at: next.airingAt * 1000 } } : {}),
    updatedAt,
    entry: { anilistId: media.id, malId: card.idMal, title: card.title, status: entry.status, progress: entry.progress, score: entry.score },
  }
}

export async function fetchList(): Promise<ListItem[]> {
  const { id } = await viewer()
  const data = await gql<{ MediaListCollection: { lists: { isCustomList: boolean; entries: { id: number; status: string; progress: number; score: number; updatedAt: number; media: ListMedia }[] }[] } }>(
    `query ($userId: Int) { MediaListCollection(userId: $userId, type: ANIME) { lists { isCustomList entries { id status progress score(format: POINT_10) updatedAt media { ${CARD} status nextAiringEpisode { episode airingAt } } } } } }`,
    { userId: id },
  )
  const entries = data.MediaListCollection.lists.filter((list) => !list.isCustomList).flatMap((list) => list.entries)
  const unique = [...new Map(entries.map((e) => [e.media.id, e])).values()]
  return unique.map((e) => toListItem(e.media, { status: toStatus(e.status), progress: e.progress, score: e.score }, e.updatedAt * 1000, e.id))
}

const lookupCache = new Map<string, { at: number; media: ListMedia }>()
const LOOKUP_TTL = 600_000

export async function mediaLookup(by: 'id' | 'idMal', ids: number[]): Promise<Map<number, ListMedia>> {
  const result = new Map<number, ListMedia>()
  for (const id of ids) {
    const hit = lookupCache.get(`${by}:${id}`)
    if (hit && Date.now() - hit.at < LOOKUP_TTL) result.set(id, hit.media)
  }
  const unique = [...new Set(ids)].filter((id) => !result.has(id))
  for (let i = 0; i < unique.length; i += 50) {
    const data = await gql<{ Page: { media: ListMedia[] } }>(
      `query ($ids: [Int]) { Page(perPage: 50) { media(${by}_in: $ids, type: ANIME) { ${CARD} status nextAiringEpisode { episode airingAt } } } }`,
      { ids: unique.slice(i, i + 50) },
    )
    for (const m of data.Page.media) {
      const key = by === 'id' ? m.id : m.idMal!
      result.set(key, m)
      lookupCache.set(`${by}:${key}`, { at: Date.now(), media: m })
    }
  }
  return result
}

export async function saveEntry(change: Change): Promise<number> {
  const data = await gql<{ SaveMediaListEntry: { id: number } }>(
    'mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $scoreRaw: Int) { SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, scoreRaw: $scoreRaw) { id } }',
    { mediaId: change.anilistId, status: fromStatus(change.status), progress: change.progress, scoreRaw: Math.round(change.score * 10) },
  )
  return data.SaveMediaListEntry.id
}

export async function anilistEntry(mediaId: number): Promise<{ progress: number; updatedAt: number } | null> {
  const data = await gql<{ Media: { mediaListEntry: { progress: number; updatedAt: number } | null } }>('query ($id: Int) { Media(id: $id) { mediaListEntry { progress updatedAt } } }', { id: mediaId })
  const entry = data.Media.mediaListEntry
  return entry ? { progress: entry.progress, updatedAt: entry.updatedAt * 1000 } : null
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
    `query ($id: Int) { Media(id: $id) { ${CARD} description(asHtml: false) bannerImage status nextAiringEpisode { episode } mediaListEntry { id status progress score(format: POINT_10) } recommendations(sort: RATING_DESC, perPage: 15) { nodes { mediaRecommendation { ${CARD} } } } relations { edges { relationType node { ${CARD} type status startDate { year month day } } } } } }`,
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

export type Shelf = 'season' | 'upcoming' | 'top' | 'binge' | 'gems' | 'popular'

const shelfFilters: Record<Shelf, string> = {
  season: 'season: $season, seasonYear: $year, sort: POPULARITY_DESC',
  upcoming: 'season: $next, seasonYear: $nextYear, sort: POPULARITY_DESC',
  top: 'format_in: [TV, MOVIE, ONA], sort: SCORE_DESC',
  binge: 'format: TV, status: FINISHED, episodes_lesser: 14, averageScore_greater: 70, sort: SCORE_DESC',
  gems: 'format_in: [TV, ONA], episodes_greater: 4, averageScore_greater: 74, popularity_greater: 3000, popularity_lesser: 50000, sort: SCORE_DESC',
  popular: 'sort: POPULARITY_DESC',
}

const startersOnly: Shelf[] = ['top', 'binge', 'gems', 'popular']

type ShelfMedia = MediaNode & { relations?: { edges: { relationType: string; node: { type: string } }[] } }

const isStarter = (m: ShelfMedia) => !m.relations?.edges.some((e) => e.node.type === 'ANIME' && (e.relationType === 'PREQUEL' || e.relationType === 'PARENT'))

export async function shelves(date = new Date()): Promise<Record<Shelf, Card[]>> {
  const now = currentSeason(date)
  const next = currentSeason(new Date(date.getFullYear(), date.getMonth() + 3, 1))
  const pages = (Object.keys(shelfFilters) as Shelf[]).flatMap((shelf) => {
    const starter = startersOnly.includes(shelf)
    const fields = starter ? `${CARD} relations { edges { relationType node { type } } }` : CARD
    return (starter ? [1, 2] : [1]).map((page) => `${shelf}${page}: Page(page: ${page}, perPage: ${starter ? 50 : 30}) { media(type: ANIME, isAdult: false, ${shelfFilters[shelf]}) { ${fields} } }`)
  })
  const data = await gql<Record<string, { media: ShelfMedia[] }>>(
    `query ($season: MediaSeason, $year: Int, $next: MediaSeason, $nextYear: Int) { ${pages.join(' ')} }`,
    { season: now.season, year: now.year, next: next.season, nextYear: next.year },
    false,
  )
  const result = {} as Record<Shelf, Card[]>
  for (const shelf of Object.keys(shelfFilters) as Shelf[]) {
    const media = Object.entries(data).filter(([key]) => key.replace(/\d+$/, '') === shelf).flatMap(([, page]) => page.media)
    result[shelf] = (startersOnly.includes(shelf) ? media.filter(isStarter) : media).map(toCard)
  }
  return result
}

export interface Taste {
  genres: Record<number, string[]>
  sequels: Record<number, Card[]>
}

export async function taste(ids: number[]): Promise<Taste> {
  const result: Taste = { genres: {}, sequels: {} }
  if (!ids.length) return result
  const data = await gql<{ Page: { media: { id: number; genres: string[]; relations: { edges: RelationEdge[] } }[] } }>(
    `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { id genres relations { edges { relationType node { ${CARD} type status startDate { year month day } } } } } } }`,
    { ids: ids.slice(0, 50) },
  )
  for (const m of data.Page.media) {
    result.genres[m.id] = m.genres
    result.sequels[m.id] = toRelated(m.relations.edges).filter((r) => r.relation === 'Sequel' && r.released)
  }
  return result
}

export async function topInGenre(genre: string): Promise<Card[]> {
  const pages = [1, 2, 3].map((page) => `p${page}: Page(page: ${page}, perPage: 50) { media(type: ANIME, isAdult: false, genre: $genre, format_in: [TV, MOVIE, ONA], sort: SCORE_DESC) { ${CARD} relations { edges { relationType node { type } } } } }`)
  const data = await gql<Record<string, { media: ShelfMedia[] }>>(`query ($genre: String) { ${pages.join(' ')} }`, { genre }, false)
  return Object.values(data).flatMap((page) => page.media).filter(isStarter).map(toCard)
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
