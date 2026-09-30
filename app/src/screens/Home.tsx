import { useEffect, useState } from 'react'
import { fetchList, season } from '../anilist/api'
import { AuthError } from '../http'
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
  const progressOf = new Map(watching.map((i) => [i.card.id, i.entry.progress]))

  return (
    <div className="screen" style={{ overflowY: 'auto' }}>
      {offline && <p className="muted">Offline or a service is down. Showing what is cached.</p>}
      <header style={{ display: 'flex', gap: 24, marginBottom: 32, alignItems: 'center' }}>
        <h1 style={{ margin: 0, marginRight: 'auto' }}>ZnZ Anime</h1>
        <Focusable className="btn" autoFocus onEnter={() => push({ name: 'search' })}>Search</Focusable>
        <Focusable className="btn" onEnter={() => push({ name: 'settings' })}>Settings</Focusable>
      </header>
      <PosterRow title="Continue Watching" focusKey="row-continue" cards={watching.map((i) => i.card)} badge={(c) => `Next: episode ${(progressOf.get(c.id) ?? 0) + 1}`} />
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
      <PosterRow title="Airing This Season" focusKey="row-airing" cards={airing} />
      <PosterRow title="Planning" focusKey="row-planning" cards={planning.map((i) => i.card)} />
    </div>
  )
}
