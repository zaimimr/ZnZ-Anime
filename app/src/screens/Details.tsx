import { FocusContext, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useCallback, useEffect, useState } from 'react'
import { type Details, details } from '../anilist/api'
import { type LibraryEntry, libraryEntry } from '../library'
import { useRouter } from '../nav/router'
import { statusLabels, statusOrder } from '../list'
import { nextEpisode, playTarget } from '../player/logic'
import { getResume } from '../player/resume'
import { getSettings, saveSettings } from '../settings'
import { resolveFirst } from '../sources/registry'
import type { Episode } from '../sources/types'
import { NotOnMalError, removeEverywhere, saveEverywhere } from '../sync/writer'
import type { Status } from '../types'
import { Focusable } from '../ui/Focusable'
import { Icon } from '../ui/Icon'
import { PosterRow } from '../ui/PosterRow'

type SourceState = { state: 'loading' } | { state: 'none' } | { state: 'ready'; source: string; episodes: Episode[] }

function EpisodeRow({ id, episodes, watched, target }: { id: number; episodes: Episode[]; watched: number; target: number }) {
  const { push } = useRouter()
  const { ref, focusKey } = useFocusable<unknown, HTMLElement>({ focusKey: 'episodes', saveLastFocusedChild: true, preferredChildFocusKey: `ep-${target}` })
  return (
    <FocusContext.Provider value={focusKey}>
      <section ref={ref} className="row">
        <h2>Episodes</h2>
        <div className="row-track">
          {episodes.map((ep) => {
            const position = getResume(id, ep.number)
            const done = ep.number <= watched
            return (
              <Focusable key={ep.number} focusKey={`ep-${ep.number}`} className={`episode ${done ? 'watched' : ''}`} onEnter={() => push({ name: 'player', id, ep: ep.number })}>
                <div className="thumb">
                  {ep.thumbnail ? <img src={ep.thumbnail} alt="" loading="lazy" /> : <div className="blank">{ep.number}</div>}
                  {done && <div className="check"><Icon name="check" size={24} /></div>}
                  {ep.filler && <div className="tag">{ep.filler === 'filler' ? 'Filler' : 'Part filler'}</div>}
                  {!done && position > 0 && ep.duration ? <div className="progress"><div style={{ width: `${Math.min(100, (position / ep.duration) * 100)}%` }} /></div> : null}
                </div>
                <span>E{ep.number}{ep.title ? ` · ${ep.title}` : ''}</span>
                {ep.duration ? <span className="muted">{Math.round(ep.duration / 60)} min</span> : null}
              </Focusable>
            )
          })}
        </div>
      </section>
    </FocusContext.Provider>
  )
}

function StatusMenu({ current, onPick }: { current?: Status; onPick: (status: Status | null) => void }) {
  const { ref, focusKey } = useFocusable<unknown, HTMLDivElement>({ focusKey: 'status-menu', isFocusBoundary: true })
  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="menu">
        {statusOrder.map((s) => (
          <Focusable key={s} className={`menu-item ${s === current ? 'current' : ''}`} autoFocus={s === (current ?? 'planning')} onEnter={() => onPick(s)}>
            <span className="tick">{s === current && <Icon name="check" size={22} />}</span>
            {statusLabels[s]}
          </Focusable>
        ))}
        {current && (
          <Focusable className="menu-item danger" onEnter={() => onPick(null)}>
            <span className="tick" />
            Remove from list
          </Focusable>
        )}
      </div>
    </FocusContext.Provider>
  )
}

export function DetailsScreen({ id }: { id: number }) {
  const { push } = useRouter()
  const [info, setInfo] = useState<Details | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [source, setSource] = useState<SourceState>({ state: 'loading' })
  const [entry, setEntry] = useState<LibraryEntry>({ progress: 0, score: 0 })
  const [lang, setLang] = useState(getSettings().lang)
  const [menu, setMenu] = useState(false)
  const [notice, setNotice] = useState('')
  const { setBackHandler } = useRouter()

  useEffect(() => {
    if (!menu) return
    setBackHandler(() => {
      setMenu(false)
      setFocus('status-btn')
      return true
    })
    return () => setBackHandler(null)
  }, [menu, setBackHandler])

  const loadSource = useCallback((media: Details) => {
    setSource({ state: 'loading' })
    resolveFirst({ anilistId: media.id, titles: media.titles }).then((r) =>
      setSource(r ? { state: 'ready', source: r.adapter.id, episodes: r.episodes } : { state: 'none' }),
    )
  }, [])

  useEffect(() => {
    setFailed(false)
    details(id)
      .then((d) => {
        setInfo(d)
        loadSource(d)
        setEntry({ status: d.listStatus, progress: d.progress, score: d.score, listId: d.listId })
        libraryEntry(d).then(setEntry).catch(() => undefined)
      })
      .catch(() => setFailed(true))
  }, [id, loadSource, attempt])

  const toggleLang = () => {
    const next = lang === 'sub' ? 'dub' : 'sub'
    setLang(next)
    saveSettings({ ...getSettings(), lang: next })
  }

  const closeMenu = () => {
    setMenu(false)
    setFocus('status-btn')
  }

  const setStatus = async (status: Status | null) => {
    if (!info) return
    closeMenu()
    try {
      if (status === null) {
        await removeEverywhere(info.id, entry.listId, info.idMal)
        setEntry({ progress: 0, score: 0 })
        setNotice('Removed from your list')
      } else {
        const progress = status === 'completed' ? (info.episodes ?? entry.progress) : entry.progress
        await saveEverywhere({ anilistId: info.id, malId: info.idMal, status, progress, score: entry.score })
        setEntry({ ...entry, status, progress })
        setNotice(`Moved to ${statusLabels[status]}`)
      }
    } catch (e) {
      setNotice(e instanceof NotOnMalError ? e.message : 'Could not update your list. It will retry when the app starts.')
    }
  }

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  if (failed) {
    return (
      <div className="screen center">
        <p>Could not load this anime.</p>
        <Focusable className="btn" autoFocus onEnter={() => setAttempt((a) => a + 1)}>Retry</Focusable>
      </div>
    )
  }

  if (!info) return <div className="screen center muted">Loading...</div>

  const watched = entry.progress
  const available = source.state === 'ready' ? source.episodes.length : undefined
  const total = info.episodes ?? available
  const firstTarget = playTarget(watched, available, info.episodes)
  const skipFiller = getSettings().skipFiller && source.state === 'ready'
  const target = skipFiller && source.episodes.find((e) => e.number === firstTarget)?.filler === 'filler' ? (nextEpisode(source.episodes, firstTarget, available ?? firstTarget, true) ?? firstTarget) : firstTarget
  const relations = new Map(info.related.map((r) => [r.id, r.relation]))

  return (
    <div className="screen" style={{ overflowY: 'auto', background: info.banner ? `linear-gradient(90deg, var(--bg) 45%, transparent), linear-gradient(transparent 160px, var(--bg) 404px), url(${info.banner}) right top / 100% auto no-repeat` : undefined }}>
      <div style={{ maxWidth: 1100, marginBottom: 40 }}>
        <h1 style={{ margin: '0 0 12px', fontSize: 64 }}>{info.title}</h1>
        <p className="muted">
          {[info.status === 'NOT_YET_RELEASED' ? 'Not aired yet' : info.episodes ? `${info.episodes} episodes` : 'Ongoing', entry.status && statusLabels[entry.status], watched > 0 && `Watched ${watched}${total ? ` of ${total}` : ''}`].filter(Boolean).join(' · ')}
        </p>
        <p style={{ fontSize: 24, lineHeight: 1.4, maxHeight: 136, overflow: 'hidden' }}>{info.description}</p>
        <div style={{ display: 'flex', gap: 16 }}>
          {source.state !== 'none' && (
            <Focusable className="btn play" autoFocus onEnter={() => push({ name: 'player', id: info.id, ep: target })}>
              <Icon name="play" size={26} /> {getResume(info.id, target) > 0 ? 'Resume' : 'Play'} episode {target}
            </Focusable>
          )}
          <div className="menu-anchor">
            <Focusable focusKey="status-btn" className="btn with-icon" autoFocus={source.state === 'none'} onEnter={() => setMenu(true)}>
              {entry.status ? statusLabels[entry.status] : 'Add to list'} <Icon name="down" size={22} />
            </Focusable>
            {menu && <StatusMenu current={entry.status} onPick={(st) => void (st === entry.status ? closeMenu() : setStatus(st))} />}
          </div>
          <Focusable className="btn" onEnter={toggleLang}>Audio: {lang === 'sub' ? 'Japanese' : 'English'}</Focusable>
        </div>
        {notice && <p className="notice">{notice}</p>}
      </div>
      {source.state === 'loading' && <p className="muted">Finding episodes...</p>}
      {source.state === 'none' && (
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <p>{info.status === 'NOT_YET_RELEASED' ? 'This show has not aired yet.' : 'No streams found for this show right now.'}</p>
          <Focusable className="btn" onEnter={() => loadSource(info)}>Retry</Focusable>
        </div>
      )}
      {source.state === 'ready' && <EpisodeRow id={info.id} episodes={source.episodes} watched={watched} target={target} />}
      <PosterRow title="Seasons and related" focusKey="row-related" cards={info.related} badge={(c) => relations.get(c.id)} />
      <PosterRow title="More like this" focusKey="row-similar" cards={info.recommended} />
    </div>
  )
}
