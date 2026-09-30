import { useEffect, useState } from 'react'
import { fetchList, recommendations, season } from '../anilist/api'
import { AuthError } from '../http'
import { newEpisodes, progressLabel } from '../list'
import { useRouter } from '../nav/router'
import { type TrendWindow, topTrending } from '../trending'
import type { Card, ListItem } from '../types'
import { Focusable } from '../ui/Focusable'
import { PosterRow } from '../ui/PosterRow'

const windowLabels: Record<TrendWindow, string> = { day: 'Day', week: 'Week', month: 'Month' }

export function Home() {
  const { push, replace } = useRouter()
  const [list, setList] = useState<ListItem[]>([])
  const [airing, setAiring] = useState<Card[]>([])
  const [trendWindow, setTrendWindow] = useState<TrendWindow>('day')
  const [trending, setTrending] = useState<Card[]>([])
  const [offline, setOffline] = useState(false)
  const [because, setBecause] = useState<{ title: string; cards: Card[] } | null>(null)

  const fail = (e: unknown) => {
    if (e instanceof AuthError) replace({ name: 'pair', provider: e.provider, next: 'home' })
    else setOffline(true)
  }

  useEffect(() => {
    fetchList().then(setList).catch(fail)
    season().then(setAiring).catch(fail)
  }, [])

  useEffect(() => {
    topTrending(trendWindow).then(setTrending).catch(fail)
  }, [trendWindow])

  const watching = list.filter((i) => i.entry.status === 'watching').sort((a, b) => b.updatedAt - a.updatedAt)
  const planning = list.filter((i) => i.entry.status === 'planning')
  const fresh = newEpisodes(list)
  const byId = new Map(list.map((i) => [i.card.id, i]))
  const seed = [...list].filter((i) => i.entry.status === 'watching' || i.entry.status === 'completed').sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const seedId = seed?.card.id
  const seedTitle = seed?.card.title ?? ''

  useEffect(() => {
    if (!seedId) return
    const known = new Set(list.map((i) => i.card.id))
    recommendations(seedId)
      .then((cards) => setBecause({ title: seedTitle, cards: cards.filter((c) => !known.has(c.id)) }))
      .catch(() => undefined)
  }, [seedId, seedTitle, list])

  const continueLabel = (c: Card) => {
    const item = byId.get(c.id)
    if (!item) return undefined
    if (item.nextAiring && item.entry.progress >= (item.aired ?? 0)) return progressLabel(item)
    return `Next: episode ${item.entry.progress + 1}`
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
      <PosterRow title="New episodes" focusKey="row-new" cards={fresh.map((i) => i.card)} badge={(c) => { const i = byId.get(c.id); return i ? progressLabel(i) : undefined }} />
      <PosterRow title="Continue watching" focusKey="row-continue" cards={watching.slice(0, 30).map((i) => i.card)} badge={continueLabel} />
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
      {because && <PosterRow title={`Because you watched ${because.title}`} focusKey="row-because" cards={because.cards} />}
      <PosterRow title="Airing this season" focusKey="row-airing" cards={airing} />
      <PosterRow title="Planning" focusKey="row-planning" cards={planning.slice(0, 30).map((i) => i.card)} />
    </div>
  )
}
