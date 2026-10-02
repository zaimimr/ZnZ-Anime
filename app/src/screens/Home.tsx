import { useEffect, useState } from 'react'
import { type Shelf, type Taste, recommendations, shelves, taste, topInGenre } from '../anilist/api'
import { cached } from '../cache'
import { continueWatching, readHistory, unlistedItems } from '../history'
import { distinct, favoriteGenres } from '../home'
import { fetchLibrary } from '../library'
import { newEpisodes, progressLabel } from '../list'
import { useOnResume, useRouter } from '../nav/router'
import { type TrendWindow, topTrending } from '../trending'
import type { Card, ListItem } from '../types'
import { Focusable } from '../ui/Focusable'
import { PosterRow } from '../ui/PosterRow'

const windowLabels: Record<TrendWindow, string> = { day: 'Day', week: 'Week', month: 'Month' }
const HALF_DAY = 43_200_000
const tasteMemo = new Map<string, Promise<Taste>>()

function tasteFor(ids: number[]): Promise<Taste> {
  const key = ids.join(',')
  if (!tasteMemo.has(key)) tasteMemo.set(key, taste(ids).catch((e: unknown) => { tasteMemo.delete(key); throw e }))
  return tasteMemo.get(key)!
}

export function Home() {
  const { push } = useRouter()
  const [list, setList] = useState<ListItem[]>([])
  const [history, setHistory] = useState(readHistory)
  const [unlisted, setUnlisted] = useState<ListItem[]>([])
  const [shelf, setShelf] = useState<Partial<Record<Shelf, Card[]>>>({})
  const [profile, setProfile] = useState<Taste>({ genres: {}, sequels: {} })
  const [genreRows, setGenreRows] = useState<{ genre: string; cards: Card[] }[]>([])
  const [trendWindow, setTrendWindow] = useState<TrendWindow>('day')
  const [trending, setTrending] = useState<Card[]>([])
  const [offline, setOffline] = useState(false)
  const [because, setBecause] = useState<{ title: string; cards: Card[] }[]>([])

  const fail = () => setOffline(true)

  useOnResume(() => setHistory(readHistory()))

  useEffect(() => {
    fetchLibrary()
      .then((items) => {
        setList(items)
        return unlistedItems(items, history).then(setUnlisted)
      })
      .catch(fail)
  }, [history])

  useEffect(() => {
    cached('home.shelves', HALF_DAY, () => shelves()).then(setShelf).catch(fail)
  }, [])

  useEffect(() => {
    topTrending(trendWindow).then(setTrending).catch(fail)
  }, [trendWindow])

  const watching = continueWatching(list, history, unlisted)
  const planning = list.filter((i) => i.entry.status === 'planning')
  const fresh = newEpisodes(list)
  const byId = new Map([...unlisted, ...list].map((i) => [i.card.id, i]))
  const played = new Map(history.map((h) => [h.id, h]))
  const recent = (i: ListItem) => Math.max(played.get(i.card.id)?.at ?? 0, i.updatedAt)
  const completed = list.filter((i) => i.entry.status === 'completed').sort((a, b) => recent(b) - recent(a))
  const seeds = [...new Map([...watching, ...completed].sort((a, b) => recent(b) - recent(a)).map((i) => [i.card.id, i])).values()]
  const seedIds = seeds.slice(0, 50).map((i) => i.card.id).join(',')
  const becauseSeeds = JSON.stringify(seeds.slice(0, 2).map((i) => ({ id: i.card.id, title: i.card.title })))
  const listed = new Set(byId.keys())
  const started = new Set([...byId.values()].filter((i) => i.entry.status !== 'planning').map((i) => i.card.id))
  const genres = favoriteGenres(seedIds ? seedIds.split(',').map(Number) : [], profile.genres)
  const genreKey = genres.join('|')
  const sequels = distinct([completed.flatMap((i) => profile.sequels[i.card.id] ?? [])], listed)[0]
  const [top, genreA, binge, genreB, gems, popular] = distinct([shelf.top ?? [], genreRows[0]?.cards ?? [], shelf.binge ?? [], genreRows[1]?.cards ?? [], shelf.gems ?? [], shelf.popular ?? []], started)

  useEffect(() => {
    if (!seedIds) return
    tasteFor(seedIds.split(',').map(Number)).then(setProfile).catch(() => undefined)
  }, [seedIds])

  useEffect(() => {
    if (!genreKey) return
    Promise.all(genreKey.split('|').map((genre) => cached(`home.genre.${genre}`, HALF_DAY, () => topInGenre(genre)).then((cards) => ({ genre, cards }))))
      .then(setGenreRows)
      .catch(() => undefined)
  }, [genreKey])

  useEffect(() => {
    const picks: { id: number; title: string }[] = JSON.parse(becauseSeeds)
    if (!picks.length) return
    Promise.all(picks.map((p) => recommendations(p.id).then((cards) => ({ title: p.title, cards })).catch(() => ({ title: p.title, cards: [] }))))
      .then(setBecause)
  }, [becauseSeeds])

  const becauseRows = distinct(because.map((b) => b.cards), listed).map((cards, i) => ({ title: because[i].title, cards }))

  const continueLabel = (c: Card) => {
    const item = byId.get(c.id)
    if (!item) return undefined
    const last = played.get(c.id)
    if (last && !last.done) return `Resume episode ${last.ep}`
    const upcoming = Math.max(item.entry.progress, last?.ep ?? 0) + 1
    if (item.nextAiring && upcoming > (item.aired ?? 0)) return progressLabel(item)
    return `Next: episode ${upcoming}`
  }

  return (
    <div className="screen" style={{ overflowY: 'auto' }}>
      {offline && <p className="muted">Offline or a service is down. Showing what is cached.</p>}
      <header style={{ display: 'flex', gap: 24, marginBottom: 32, alignItems: 'center' }}>
        <h1 className="brand"><img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" />ZnZ<span>Anime</span></h1>
        <Focusable className="btn" autoFocus onEnter={() => push({ name: 'list' })}>My list</Focusable>
        <Focusable className="btn" onEnter={() => push({ name: 'schedule' })}>This week</Focusable>
        <Focusable className="btn" onEnter={() => push({ name: 'search' })}>Search</Focusable>
        <Focusable className="btn" onEnter={() => push({ name: 'settings' })}>Settings</Focusable>
      </header>
      <PosterRow title="Continue watching" focusKey="row-continue" cards={watching.slice(0, 30).map((i) => i.card)} badge={continueLabel} />
      <PosterRow title="New episodes" focusKey="row-new" cards={fresh.map((i) => i.card)} badge={(c) => { const i = byId.get(c.id); return i ? progressLabel(i) : undefined }} />
      <PosterRow
        title="Top Trending"
        focusKey="row-trending"
        cards={trending}
        header={
          <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
            {(Object.keys(windowLabels) as TrendWindow[]).map((w) => (
              <Focusable key={w} className={`btn ${w === trendWindow ? 'active' : ''}`} onEnter={() => setTrendWindow(w)}>{windowLabels[w]}</Focusable>
            ))}
          </div>
        }
      />
      <PosterRow title="Next seasons for you" focusKey="row-sequels" cards={sequels} />
      {becauseRows[0] && <PosterRow title={`Because you watched ${becauseRows[0].title}`} focusKey="row-because" cards={becauseRows[0].cards} />}
      <PosterRow title="Popular this season" focusKey="row-airing" cards={shelf.season ?? []} />
      <PosterRow title="Highest rated" focusKey="row-top" cards={top} />
      {becauseRows[1] && <PosterRow title={`Because you watched ${becauseRows[1].title}`} focusKey="row-because-2" cards={becauseRows[1].cards} />}
      {genreRows[0] && <PosterRow title={`Best of ${genreRows[0].genre}`} focusKey="row-genre" cards={genreA} />}
      <PosterRow title="Short binges" focusKey="row-binge" cards={binge} />
      {genreRows[1] && <PosterRow title={`Best of ${genreRows[1].genre}`} focusKey="row-genre-2" cards={genreB} />}
      <PosterRow title="Hidden gems" focusKey="row-gems" cards={gems} />
      <PosterRow title="Most popular of all time" focusKey="row-popular" cards={popular} />
      <PosterRow title="Coming next season" focusKey="row-upcoming" cards={shelf.upcoming ?? []} />
      <PosterRow title="Planning" focusKey="row-planning" cards={planning.slice(0, 30).map((i) => i.card)} />
    </div>
  )
}
