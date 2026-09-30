import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useCallback, useEffect, useState } from 'react'
import { type Details, details } from '../anilist/api'
import { AuthError } from '../http'
import { useRouter } from '../nav/router'
import { getSettings, saveSettings } from '../settings'
import { resolveFirst } from '../sources/registry'
import type { Episode } from '../sources/types'
import { saveEverywhere } from '../sync/writer'
import type { Status } from '../types'
import { Focusable } from '../ui/Focusable'

type SourceState = { state: 'loading' } | { state: 'none' } | { state: 'ready'; source: string; episodes: Episode[] }

const statusLabels: Record<Status, string> = { watching: 'Watching', completed: 'Completed', paused: 'Paused', dropped: 'Dropped', planning: 'Planning' }

export function DetailsScreen({ id }: { id: number }) {
  const { push, replace } = useRouter()
  const [info, setInfo] = useState<Details | null>(null)
  const [source, setSource] = useState<SourceState>({ state: 'loading' })
  const [lang, setLang] = useState(getSettings().lang)
  const { ref, focusKey } = useFocusable<unknown, HTMLDivElement>({ focusKey: 'episodes' })

  const loadSource = useCallback((media: Details) => {
    setSource({ state: 'loading' })
    resolveFirst({ anilistId: media.id, titles: media.titles }).then((r) =>
      setSource(r ? { state: 'ready', source: r.adapter.id, episodes: r.episodes } : { state: 'none' }),
    )
  }, [])

  useEffect(() => {
    details(id)
      .then((d) => {
        setInfo(d)
        loadSource(d)
      })
      .catch((e) => e instanceof AuthError && replace({ name: 'pair', provider: e.provider, next: 'home' }))
  }, [id, loadSource, replace])

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

  if (!info) return <div className="screen center muted">Loading...</div>

  const nextEp = info.progress + 1

  return (
    <div className="screen" style={{ background: info.banner ? `linear-gradient(90deg, var(--bg) 45%, transparent), url(${info.banner}) right top / cover no-repeat` : undefined }}>
      <div style={{ display: 'flex', gap: 48 }}>
        <img src={info.cover} alt="" style={{ width: 300, height: 426, borderRadius: 12, objectFit: 'cover' }} />
        <div style={{ maxWidth: 1100 }}>
          <h1 style={{ margin: '0 0 12px' }}>{info.title}</h1>
          <p className="muted">
            {info.episodes ? `${info.episodes} episodes` : 'Ongoing'}
            {info.listStatus && ` · ${statusLabels[info.listStatus]} · watched ${info.progress}`}
          </p>
          <p style={{ fontSize: 24, lineHeight: 1.4, maxHeight: 200, overflow: 'hidden' }}>{info.description}</p>
          <div style={{ display: 'flex', gap: 16 }}>
            <Focusable className="btn" onEnter={toggleLang}>Language: {lang.toUpperCase()}</Focusable>
            {!info.listStatus && <Focusable className="btn" onEnter={addToPlanning}>Add to Planning</Focusable>}
          </div>
        </div>
      </div>
      <FocusContext.Provider value={focusKey}>
        <div ref={ref} style={{ marginTop: 40 }}>
          {source.state === 'loading' && <p className="muted">Finding episodes...</p>}
          {source.state === 'none' && (
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              <p>No source available.</p>
              <Focusable className="btn" autoFocus onEnter={() => loadSource(info)}>Retry</Focusable>
            </div>
          )}
          {source.state === 'ready' && (
            <>
              <p className="muted">Source: {source.source}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, maxHeight: 300, overflow: 'hidden' }}>
                {source.episodes.map((ep) => (
                  <Focusable key={ep.number} className={`btn ${ep.number <= info.progress ? 'muted' : ''}`} autoFocus={ep.number === Math.min(nextEp, source.episodes.length)} onEnter={() => push({ name: 'player', id: info.id, ep: ep.number })}>
                    {ep.number}
                  </Focusable>
                ))}
              </div>
            </>
          )}
        </div>
      </FocusContext.Provider>
    </div>
  )
}
