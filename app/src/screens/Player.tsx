import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Details, details } from '../anilist/api'
import { AuthError } from '../http'
import { keyAction } from '../nav/keys'
import { useRouter } from '../nav/router'
import { attachStream } from '../player/attach'
import { activeSkip, countdownAt, nextStreamIndex, shouldMarkWatched, shouldSaveResume, statusAfter } from '../player/logic'
import { playableUrl } from '../player/proxy'
import { clearResume, getResume, setResume } from '../player/resume'
import { getSettings } from '../settings'
import { resolveFirst, streamsWithFallback } from '../sources/registry'
import type { SkipRange, SourceAdapter, SourceShow, Stream } from '../sources/types'
import { saveEverywhere } from '../sync/writer'
import type { Lang } from '../types'

interface Loaded {
  info: Details
  adapter: SourceAdapter
  show: SourceShow
  streams: Stream[]
  lang: Lang
  total: number
  skip?: SkipRange[]
}

const format = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function PlayerScreen({ id, ep }: { id: number; ep: number }) {
  const { back, replace, setBackHandler } = useRouter()
  const video = useRef<HTMLVideoElement>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [index, setIndex] = useState(0)
  const [error, setError] = useState('')
  const [badge, setBadge] = useState('')
  const [overlay, setOverlay] = useState(true)
  const [time, setTime] = useState({ now: 0, total: 0 })
  const [countdown, setCountdown] = useState<number | null>(null)
  const [undoIntro, setUndoIntro] = useState<SkipRange | null>(null)
  const marked = useRef(false)
  const intro = useRef<'pending' | 'skipped' | 'watching'>('pending')
  const countdownFired = useRef(false)
  const startAt = useRef(getResume(id, ep))
  const triedAdapters = useRef<string[]>([])

  const load = useCallback(async (skipAdapters: string[]): Promise<void> => {
    const info = await details(id)
    const found = await resolveFirst({ anilistId: id, titles: info.titles }, skipAdapters)
    if (!found) return setError('No source available.')
    triedAdapters.current = [...skipAdapters, found.adapter.id]
    const wanted = getSettings().lang
    const { streams, lang } = await streamsWithFallback(found.adapter, found.show, ep, wanted)
    if (!streams.length) return load(triedAdapters.current)
    setBadge(lang === wanted ? `Playing ${lang.toUpperCase()}` : `${wanted.toUpperCase()} not available, playing ${lang.toUpperCase()}`)
    setIndex(0)
    setLoaded({ info, adapter: found.adapter, show: found.show, streams, lang, total: info.episodes ?? found.episodes.length, skip: found.episodes.find((e) => e.number === ep)?.skip })
  }, [id, ep])

  useEffect(() => {
    load([]).catch(() => setError('Could not load this episode.'))
  }, [load])

  const nextStream = useCallback((skipProvider = false) => {
    if (!loaded) return
    startAt.current = video.current?.currentTime || startAt.current
    const next = nextStreamIndex(loaded.streams, index, skipProvider)
    if (next >= 0) setIndex(next)
    else load(triedAdapters.current).catch(() => setError('No source available.'))
  }, [loaded, index, load])

  useEffect(() => {
    const stream = loaded?.streams[index]
    const el = video.current
    if (!stream || !el) return
    const detach = attachStream(el, playableUrl(stream.url, stream.headers), stream.format, nextStream)
    void el.play().catch(() => undefined)
    return detach
  }, [loaded, index, nextStream])

  useEffect(() => {
    if (!badge) return
    const timer = setTimeout(() => setBadge(''), 3000)
    return () => clearTimeout(timer)
  }, [badge])

  useEffect(() => {
    if (!overlay) return
    const timer = setTimeout(() => setOverlay(false), 4000)
    return () => clearTimeout(timer)
  }, [overlay, time.now])

  useEffect(() => {
    const timer = setInterval(() => {
      const el = video.current
      if (el && shouldSaveResume(el)) setResume(id, ep, el.currentTime)
    }, 5000)
    return () => clearInterval(timer)
  }, [id, ep])

  const markWatched = useCallback(() => {
    if (!loaded || marked.current || ep <= loaded.info.progress) return
    marked.current = true
    void saveEverywhere({ anilistId: id, malId: loaded.info.idMal, status: statusAfter(ep, loaded.info.episodes), progress: ep, score: loaded.info.score }).catch((e) => {
      if (e instanceof AuthError) setBadge(`${e.provider === 'mal' ? 'MAL' : 'AniList'} login expired. Link it again in Settings.`)
    })
  }, [loaded, id, ep])

  const next = useMemo(() => {
    if (!loaded) return null
    if (ep < loaded.total) return { id, ep: ep + 1, label: 'Next episode' }
    const sequel = loaded.info.related.find((r) => r.relation === 'Sequel')
    return sequel ? { id: sequel.id, ep: 1, label: `Next: ${sequel.title}` } : null
  }, [loaded, id, ep])

  const playNext = useCallback(() => {
    if (!next) return
    markWatched()
    clearResume(id, ep)
    replace({ name: 'player', id: next.id, ep: next.ep })
  }, [next, markWatched, replace, id, ep])

  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) return playNext()
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown, playNext])

  const ranges = loaded?.streams[index]?.skip ?? loaded?.skip
  const skip = activeSkip(ranges, time.now)

  useEffect(() => {
    if (!undoIntro) return
    const timer = setTimeout(() => setUndoIntro(null), 5000)
    return () => clearTimeout(timer)
  }, [undoIntro])

  useEffect(() => {
    setBackHandler(() => {
      if (countdown !== null) {
        setCountdown(null)
        return true
      }
      if (undoIntro && video.current) {
        video.current.currentTime = undoIntro.start
        intro.current = 'watching'
        setUndoIntro(null)
        return true
      }
      return false
    })
    return () => setBackHandler(null)
  }, [countdown, undoIntro, setBackHandler])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = video.current
      if (!el) return
      const action = keyAction(e)
      const seek = (delta: number) => { el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + delta)) }
      if (countdown !== null && e.key === 'Enter') return playNext()
      if (e.key === 'Enter' && skip) { el.currentTime = skip.end; return }
      if (e.key === 'Enter' || action === 'playpause') { if (el.paused) void el.play(); else el.pause() }
      else if (action === 'play') void el.play()
      else if (action === 'pause') el.pause()
      else if (action === 'stop') back()
      else if (e.key === 'ArrowLeft') seek(-10)
      else if (e.key === 'ArrowRight') seek(10)
      else if (action === 'rw') seek(-30)
      else if (action === 'ff') seek(30)
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') setOverlay((v) => !v)
      else return
      e.preventDefault()
      e.stopPropagation()
      setOverlay(true)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [skip, countdown, playNext, back])

  const onTime = () => {
    const el = video.current
    if (!el || !loaded) return
    setTime({ now: el.currentTime, total: el.duration || 0 })
    if (shouldMarkWatched(el.currentTime, el.duration)) markWatched()
    const op = activeSkip(ranges, el.currentTime)
    if (op?.kind === 'op' && intro.current === 'pending') {
      intro.current = 'skipped'
      el.currentTime = op.end
      setUndoIntro(op)
    }
    const at = countdownAt(ranges, el.duration)
    if (next && at !== null && el.currentTime >= at && !countdownFired.current) {
      countdownFired.current = true
      setCountdown(5)
    }
  }

  const onMeta = () => {
    const el = video.current
    if (el && startAt.current > 0) {
      el.currentTime = startAt.current
      startAt.current = 0
    }
  }

  const onEnded = () => {
    clearResume(id, ep)
    if (next) setCountdown(10)
  }

  if (error) {
    return (
      <div className="screen center">
        <p>{error}</p>
        <p className="muted">Press Back to return.</p>
      </div>
    )
  }

  const stream = loaded?.streams[index]

  return (
    <div className="player">
      <video ref={video} crossOrigin="anonymous" onTimeUpdate={onTime} onLoadedMetadata={onMeta} onEnded={onEnded} autoPlay>
        {stream?.subtitles.map((sub, i) => (
          <track key={sub.url} kind="subtitles" src={playableUrl(sub.url, stream.headers)} srcLang={sub.lang} label={sub.label} default={sub.default ?? i === 0} />
        ))}
      </video>
      {!loaded && <div className="badge">Loading...</div>}
      {badge && <div className="badge">{badge}</div>}
      {undoIntro && countdown === null && <div className="skip">Skipped intro · Back to watch it</div>}
      {skip && !undoIntro && countdown === null && <div className="skip">Skip {skip.kind === 'op' ? 'intro' : 'outro'} (OK)</div>}
      {countdown !== null && next && <div className="skip">{next.label} in {countdown} (OK to play, Back to cancel)</div>}
      {overlay && loaded && (
        <div className="overlay">
          <div>{loaded.info.title} · Episode {ep}</div>
          <div className="muted">{format(time.now)} / {format(time.total)} · {[stream?.provider, stream?.quality].filter(Boolean).join(' ')} · {loaded.lang.toUpperCase()}</div>
          <div className="bar"><div style={{ width: `${time.total ? (time.now / time.total) * 100 : 0}%` }} /></div>
        </div>
      )}
    </div>
  )
}
