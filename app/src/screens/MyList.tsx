import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useEffect, useState } from 'react'
import { fetchLibrary, listSource } from '../library'
import { progressLabel, statusLabels, statusOrder } from '../list'
import { useRouter } from '../nav/router'
import type { ListItem, Status } from '../types'
import { Focusable } from '../ui/Focusable'

const sourceLabels = { anilist: 'From your AniList account', mal: 'From your MyAnimeList account', local: 'Saved on this TV. Link AniList or MyAnimeList in Settings to keep it online.' }

export function MyList() {
  const { push } = useRouter()
  const [items, setItems] = useState<ListItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState<Status>('watching')
  const { ref, focusKey } = useFocusable<unknown, HTMLDivElement>({ focusKey: 'list-grid', saveLastFocusedChild: true })

  useEffect(() => {
    fetchLibrary()
      .then(setItems)
      .catch(() => setFailed(true))
  }, [])

  const shown = (items ?? []).filter((i) => i.entry.status === tab).sort((a, b) => b.updatedAt - a.updatedAt)
  const count = (s: Status) => (items ?? []).filter((i) => i.entry.status === s).length

  return (
    <div className="screen" style={{ overflowY: 'auto' }}>
      <h1 style={{ margin: '0 0 8px' }}>My list</h1>
      <p className="muted" style={{ margin: '0 0 28px' }}>{sourceLabels[listSource()]}</p>
      <div className="tabs">
        {statusOrder.map((s) => (
          <Focusable key={s} className={`tab ${s === tab ? 'active' : ''}`} autoFocus={s === 'watching'} onFocus={() => setTab(s)} onEnter={() => setTab(s)}>
            {statusLabels[s]} <span className="count">{items ? count(s) : ''}</span>
          </Focusable>
        ))}
      </div>
      {failed && <p className="muted">Could not load your list. Check the connection and open it again.</p>}
      {!items && !failed && <p className="muted">Loading your list...</p>}
      {items && !shown.length && <p className="muted">Nothing in {statusLabels[tab]} yet. Open a show and choose Add to list.</p>}
      <FocusContext.Provider value={focusKey}>
        <div ref={ref} className="grid">
          {shown.map((i) => (
            <Focusable key={i.card.id} className="poster" onEnter={() => push({ name: 'details', id: i.card.id })}>
              <img src={i.card.cover} alt="" loading="lazy" />
              <span>{i.card.title}</span>
              <span className={`muted ${i.aired !== undefined && i.nextAiring && i.aired > i.entry.progress ? 'fresh' : ''}`}>{progressLabel(i)}</span>
            </Focusable>
          ))}
        </div>
      </FocusContext.Provider>
    </div>
  )
}
