import { useEffect, useState } from 'react'
import { type ScheduleItem, schedule } from '../anilist/api'
import { fetchLibrary } from '../library'
import { clock, dayName } from '../list'
import type { ListItem } from '../types'
import { PosterRow } from '../ui/PosterRow'

export function Schedule() {
  const [items, setItems] = useState<ScheduleItem[] | null>(null)
  const [list, setList] = useState<ListItem[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const from = new Date().setHours(0, 0, 0, 0)
    fetchLibrary()
      .then((l) => {
        setList(l)
        const ids = l.filter((i) => i.entry.status === 'watching' || i.entry.status === 'planning').map((i) => i.card.id)
        return schedule(ids, from, from + 7 * 86_400_000)
      })
      .then(setItems)
      .catch(() => setFailed(true))
  }, [])

  const days = new Map<string, ScheduleItem[]>()
  for (const item of items ?? []) {
    const day = dayName(item.airing.at)
    const row = days.get(day) ?? []
    if (!row.some((r) => r.card.id === item.card.id)) row.push(item)
    days.set(day, row)
  }
  const planning = new Set(list.filter((i) => i.entry.status === 'planning').map((i) => i.card.id))

  return (
    <div className="screen" style={{ overflowY: 'auto' }}>
      <h1 style={{ margin: '0 0 8px' }}>This week</h1>
      <p className="muted" style={{ margin: '0 0 32px' }}>New episodes of shows you are watching or planning.</p>
      {failed && <p className="muted">Could not load the schedule. Check the connection and open it again.</p>}
      {!items && !failed && <p className="muted">Loading the schedule...</p>}
      {items && !items.length && <p className="muted">None of your shows air in the next 7 days.</p>}
      {[...days].map(([day, row], n) => {
        const labels = new Map(row.map((r) => [r.card.id, `${r.airing.at < Date.now() ? 'Out' : clock(r.airing.at)} · Episode ${r.airing.episode}${planning.has(r.card.id) ? ' · Planning' : ''}`]))
        return <PosterRow key={day} title={day} focusKey={`day-${n}`} cards={row.map((r) => r.card)} badge={(c) => labels.get(c.id)} autoFocus={n === 0} />
      })}
    </div>
  )
}
