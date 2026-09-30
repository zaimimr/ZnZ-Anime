import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useCallback, useEffect, useState } from 'react'
import { type Details, details } from '../anilist/api'
import { getToken } from '../auth/tokens'
import { AuthError } from '../http'
import { malProgress } from '../mal/api'
import { useRouter } from '../nav/router'
import { playTarget } from '../player/logic'
import { getResume } from '../player/resume'
import { getSettings, saveSettings } from '../settings'
import { resolveFirst } from '../sources/registry'
import type { Episode } from '../sources/types'
import { saveEverywhere } from '../sync/writer'
import type { Status } from '../types'
import { Focusable } from '../ui/Focusable'
import { PosterRow } from '../ui/PosterRow'

type SourceState = { state: 'loading' } | { state: 'none' } | { state: 'ready'; source: string; episodes: Episode[] }

const statusLabels: Record<Status, string> = { watching: 'Watching', completed: 'Completed', paused: 'Paused', dropped: 'Dropped', planning: 'Planning' }

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
                  {done && <div className="check">✓</div>}
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

export function DetailsScreen({ id }: { id: number }) {
  const { push, replace } = useRouter()
  const [info, setInfo] = useState<Details | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [source, setSource] = useState<SourceState>({ state: 'loading' })
  const [malWatched, setMalWatched] = useState(0)
  const [lang, setLang] = useState(getSettings().lang)

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
        if (d.idMal && getToken('mal')) malProgress(d.idMal).then(setMalWatched).catch(() => undefined)
      })
      .catch((e) => {
        if (e instanceof AuthError) replace({ name: 'pair', provider: e.provider, next: 'home' })
        else setFailed(true)
      })
  }, [id, loadSource, replace, attempt])

  const toggleLang = () => {
    const next = lang === 'sub' ? 'dub' : 'sub'
    setLang(next)
    saveSettings({ ...getSettings(), lang: next })
  }

  const addToPlanning = async () => {
    if (!info) return
    await saveEverywhere({ anilistId: info.id, malId: info.idMal, status: 'planning', progress: info.progress, score: info.score })
    setInfo({ ...info, listStatus: 'planning' })
  }

  if (failed) {
    return (
      <div className="screen center">
        <p>Could not load this anime.</p>
        <Focusable className="btn" autoFocus onEnter={() => setAttempt((a) => a + 1)}>Retry</Focusable>
      </div>
    )
  }

  if (!info) return <div className="screen center muted">Loading...</div>

  const watched = Math.max(info.progress, malWatched)
  const available = source.state === 'ready' ? source.episodes.length : undefined
  const total = info.episodes ?? available
  const target = playTarget(watched, available, info.episodes)
  const relations = new Map(info.related.map((r) => [r.id, r.relation]))

  return (
    <div className="screen" style={{ overflowY: 'auto', background: info.banner ? `linear-gradient(90deg, var(--bg) 45%, transparent), linear-gradient(transparent 160px, var(--bg) 404px), url(${info.banner}) right top / 100% auto no-repeat` : undefined }}>
      <div style={{ maxWidth: 1100, marginBottom: 40 }}>
        <h1 style={{ margin: '0 0 12px', fontSize: 64 }}>{info.title}</h1>
        <p className="muted">
          {[info.episodes ? `${info.episodes} episodes` : 'Ongoing', info.listStatus && statusLabels[info.listStatus], watched > 0 && `Watched ${watched}${total ? ` of ${total}` : ''}`].filter(Boolean).join(' · ')}
        </p>
        <p style={{ fontSize: 24, lineHeight: 1.4, maxHeight: 136, overflow: 'hidden' }}>{info.description}</p>
        <div style={{ display: 'flex', gap: 16 }}>
          <Focusable className="btn play" autoFocus onEnter={() => push({ name: 'player', id: info.id, ep: target })}>
            ▶ {getResume(info.id, target) > 0 ? 'Resume' : 'Play'} episode {target}
          </Focusable>
          <Focusable className="btn" onEnter={toggleLang}>Language: {lang.toUpperCase()}</Focusable>
          {!info.listStatus && <Focusable className="btn" onEnter={addToPlanning}>Add to Planning</Focusable>}
        </div>
      </div>
      {source.state === 'loading' && <p className="muted">Finding episodes...</p>}
      {source.state === 'none' && (
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <p>No source available.</p>
          <Focusable className="btn" onEnter={() => loadSource(info)}>Retry</Focusable>
        </div>
      )}
      {source.state === 'ready' && <EpisodeRow id={info.id} episodes={source.episodes} watched={watched} target={target} />}
      <PosterRow title="Seasons and related" focusKey="row-related" cards={info.related} badge={(c) => relations.get(c.id)} />
    </div>
  )
}
