import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Details, details } from '../anilist/api'
import { aniskip, mergeSkips } from '../aniskip'
import { AuthError } from '../http'
import { keyAction } from '../nav/keys'
import { useRouter } from '../nav/router'
import { attachStream } from '../player/attach'
import { activeSkip, countdownAt, cycle, nextStreamIndex, providers, sections, shouldMarkWatched, shouldSaveResume, statusAfter } from '../player/logic'
import { playableUrl } from '../player/proxy'
import { clearResume, getResume, setResume } from '../player/resume'
import { getSettings, saveSettings, type Settings } from '../settings'
import { resolveFirst, streamsWithFallback } from '../sources/registry'
import type { Episode, SkipRange, SourceAdapter, SourceShow, Stream } from '../sources/types'
import { saveEverywhere } from '../sync/writer'
import type { Lang } from '../types'

interface Loaded {
  info: Details
  adapter: SourceAdapter
  show: SourceShow
  streams: Stream[]
  lang: Lang
  total: number
  episodes: Episode[]
}

interface Row {
  label: string
  value: string
  change?: (dir: 1 | -1) => void
}

const format = (s: number) => {
  const t = Math.max(0, Math.floor(s))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

const sectionLabels = { op: 'Intro', ed: 'Outro', main: '' }

function bufferedEnd(el: HTMLVideoElement): number {
  for (let i = 0; i < el.buffered.length; i++) {
    if (el.buffered.start(i) <= el.currentTime + 0.5 && el.currentTime <= el.buffered.end(i)) return el.buffered.end(i)
  }
  return el.currentTime
}

export function PlayerScreen({ id, ep }: { id: number; ep: number }) {
  const { back, replace, setBackHandler } = useRouter()
  const video = useRef<HTMLVideoElement>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [index, setIndex] = useState(0)
  const [error, setError] = useState('')
  const [badge, setBadge] = useState('')
  const [overlay, setOverlay] = useState(true)
  const [activity, setActivity] = useState(0)
  const [time, setTime] = useState({ now: 0, total: 0, buffered: 0 })
  const [paused, setPaused] = useState(false)
  const [buffering, setBuffering] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [fallbackSkip, setFallbackSkip] = useState<SkipRange[]>([])
  const [undoIntro, setUndoIntro] = useState<SkipRange | null>(null)
  const [panel, setPanel] = useState<number | null>(null)
  const [prefs, setPrefs] = useState<Settings>(getSettings())
  const [subChoice, setSubChoice] = useState<string | null>(null)
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
    if (lang !== wanted) setBadge(`${wanted.toUpperCase()} not available, playing ${lang.toUpperCase()}`)
    setIndex(0)
    setLoaded({ info, adapter: found.adapter, show: found.show, streams, lang, total: info.episodes ?? found.episodes.length, episodes: found.episodes })
  }, [id, ep])

  useEffect(() => {
    load([]).catch(() => setError('Could not load this episode.'))
  }, [load])

  const malId = loaded?.info.idMal
  useEffect(() => {
    if (malId) aniskip(malId, ep).then(setFallbackSkip).catch(() => undefined)
  }, [malId, ep])

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
    setBuffering(true)
    const detach = attachStream(el, playableUrl(stream.url, stream.headers), stream.format, nextStream)
    void el.play().catch(() => undefined)
    return detach
  }, [loaded, index, nextStream])

  const stream = loaded?.streams[index]
  const subs = useMemo(() => stream?.subtitles ?? [], [stream])
  const chosenSub = subChoice === 'off' ? null : (subs.find((s) => s.label === subChoice) ?? subs.find((s) => s.default) ?? subs[0] ?? null)

  useEffect(() => {
    const tracks = video.current?.textTracks
    if (!tracks) return
    const apply = () => {
      for (const t of Array.from(tracks)) {
        if (t.kind !== 'subtitles' && t.kind !== 'captions') continue
        t.mode = chosenSub && t.label === chosenSub.label && t.language === chosenSub.lang ? 'showing' : 'disabled'
      }
    }
    apply()
    tracks.addEventListener('addtrack', apply)
    return () => tracks.removeEventListener('addtrack', apply)
  }, [chosenSub, subs])

  useEffect(() => {
    if (!badge) return
    const timer = setTimeout(() => setBadge(''), 3000)
    return () => clearTimeout(timer)
  }, [badge])

  useEffect(() => {
    if (!overlay || paused || panel !== null || !loaded) return
    const timer = setTimeout(() => setOverlay(false), 4000)
    return () => clearTimeout(timer)
  }, [overlay, paused, panel, loaded, activity])

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
    if (ep < loaded.total) {
      const upcoming = loaded.episodes.find((e) => e.number === ep + 1)
      return { id, ep: ep + 1, label: `Episode ${ep + 1}${upcoming?.title ? ` · ${upcoming.title}` : ''}`, thumbnail: upcoming?.thumbnail }
    }
    const sequel = loaded.info.related.find((r) => r.relation === 'Sequel')
    return sequel ? { id: sequel.id, ep: 1, label: sequel.title, thumbnail: sequel.cover } : null
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

  const ranges = useMemo(() => mergeSkips(stream?.skip ?? loaded?.episodes.find((e) => e.number === ep)?.skip, fallbackSkip), [stream, loaded, ep, fallbackSkip])
  const skip = activeSkip(ranges, time.now)
  const bar = useMemo(() => sections(ranges, time.total), [ranges, time.total])

  useEffect(() => {
    if (!undoIntro) return
    const timer = setTimeout(() => setUndoIntro(null), 5000)
    return () => clearTimeout(timer)
  }, [undoIntro])

  const updatePrefs = useCallback((change: Partial<Settings>) => {
    const updated = { ...getSettings(), ...change }
    saveSettings(updated)
    setPrefs(updated)
  }, [])

  const switchStream = useCallback((i: number) => {
    startAt.current = video.current?.currentTime || startAt.current
    setIndex(i)
  }, [])

  const switchLang = useCallback(async (lang: Lang) => {
    if (!loaded) return
    startAt.current = video.current?.currentTime || startAt.current
    setSwitching(true)
    try {
      const result = await streamsWithFallback(loaded.adapter, loaded.show, ep, lang)
      if (result.lang !== lang || !result.streams.length) return setBadge(`${lang.toUpperCase()} not available for this episode`)
      updatePrefs({ lang })
      setIndex(0)
      setLoaded({ ...loaded, streams: result.streams, lang })
    } catch {
      setBadge(`Could not load ${lang.toUpperCase()}`)
    } finally {
      setSwitching(false)
    }
  }, [loaded, ep, updatePrefs])

  const rows = useMemo((): Row[] => {
    if (!loaded || !stream) return []
    const names = providers(loaded.streams)
    const sameProvider = loaded.streams.map((s, i) => ({ s, i })).filter(({ s }) => s.provider === stream.provider)
    const subOptions = ['off', ...subs.map((s) => s.label)]
    const onOff = (on: boolean) => (on ? 'On' : 'Off')
    return [
      { label: 'Audio', value: loaded.lang === 'sub' ? 'Japanese (SUB)' : 'English (DUB)', change: () => void switchLang(loaded.lang === 'sub' ? 'dub' : 'sub') },
      { label: 'Source', value: stream.provider, change: names.length > 1 ? (dir) => switchStream(loaded.streams.findIndex((s) => s.provider === cycle(names, stream.provider, dir))) : undefined },
      { label: 'Quality', value: stream.quality ?? 'Auto', change: sameProvider.length > 1 ? (dir) => switchStream(cycle(sameProvider.map((o) => o.i), index, dir)) : undefined },
      subs.length
        ? { label: 'Subtitles', value: chosenSub?.label ?? 'Off', change: (dir) => setSubChoice(cycle(subOptions, chosenSub?.label ?? 'off', dir)) }
        : { label: 'Subtitles', value: loaded.lang === 'sub' ? 'Built into video' : 'None' },
      { label: 'Skip intro automatically', value: onOff(prefs.autoSkipIntro), change: () => updatePrefs({ autoSkipIntro: !prefs.autoSkipIntro }) },
      { label: 'Play next automatically', value: onOff(prefs.autoplayNext), change: () => updatePrefs({ autoplayNext: !prefs.autoplayNext }) },
    ]
  }, [loaded, stream, index, subs, chosenSub, prefs, switchLang, switchStream, updatePrefs])

  useEffect(() => {
    setBackHandler(() => {
      if (panel !== null) {
        setPanel(null)
        return true
      }
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
  }, [panel, countdown, undoIntro, setBackHandler])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = video.current
      if (!el) return
      const action = keyAction(e)
      if (action === 'back') return
      const seek = (delta: number) => { el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + delta)) }
      if (panel !== null) {
        if (e.key === 'ArrowUp') setPanel(Math.max(0, panel - 1))
        else if (e.key === 'ArrowDown') setPanel(Math.min(rows.length - 1, panel + 1))
        else if (e.key === 'ArrowLeft') rows[panel]?.change?.(-1)
        else if (e.key === 'ArrowRight' || e.key === 'Enter') rows[panel]?.change?.(1)
        else return
      }
      else if (countdown !== null && e.key === 'Enter') playNext()
      else if (e.key === 'Enter' && skip) el.currentTime = skip.end
      else if (e.key === 'Enter' || action === 'playpause') { if (el.paused) void el.play(); else el.pause() }
      else if (action === 'play') void el.play()
      else if (action === 'pause') el.pause()
      else if (action === 'stop') back()
      else if (e.key === 'ArrowLeft') seek(-10)
      else if (e.key === 'ArrowRight') seek(10)
      else if (action === 'rw') seek(-30)
      else if (action === 'ff') seek(30)
      else if (e.key === 'ArrowDown') { if (loaded) setPanel(0) }
      else if (e.key !== 'ArrowUp') return
      e.preventDefault()
      e.stopPropagation()
      setOverlay(true)
      setActivity((a) => a + 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [panel, rows, skip, countdown, playNext, back, loaded])

  const onTime = () => {
    const el = video.current
    if (!el || !loaded) return
    setTime({ now: el.currentTime, total: el.duration || 0, buffered: bufferedEnd(el) })
    if (shouldMarkWatched(el.currentTime, el.duration)) markWatched()
    const op = activeSkip(ranges, el.currentTime)
    if (op?.kind === 'op' && intro.current === 'pending' && prefs.autoSkipIntro) {
      intro.current = 'skipped'
      el.currentTime = op.end
      setUndoIntro(op)
    }
    const at = countdownAt(ranges, el.duration)
    if (next && prefs.autoplayNext && at !== null && el.currentTime >= at && !countdownFired.current) {
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
    if (next && prefs.autoplayNext) setCountdown(10)
  }

  if (error) {
    return (
      <div className="screen center">
        <p>{error}</p>
        <p className="muted">Press Back to return.</p>
      </div>
    )
  }

  const title = loaded?.episodes.find((e) => e.number === ep)?.title
  const loading = !loaded || buffering || switching
  const pct = (s: number) => (time.total ? (s / time.total) * 100 : 0)
  const showPrompt = countdown === null && panel === null

  return (
    <div className="player">
      <video
        ref={video}
        crossOrigin="anonymous"
        onTimeUpdate={onTime}
        onLoadedMetadata={onMeta}
        onEnded={onEnded}
        onLoadStart={() => setBuffering(true)}
        onWaiting={() => setBuffering(true)}
        onSeeking={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onSeeked={() => setBuffering(false)}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onProgress={(e) => { const buffered = bufferedEnd(e.currentTarget); setTime((t) => ({ ...t, buffered })) }}
        autoPlay
      >
        {stream?.subtitles.map((sub, i) => (
          <track key={sub.url} kind="subtitles" src={playableUrl(sub.url, stream.headers)} srcLang={sub.lang} label={sub.label} default={sub.default ?? i === 0} />
        ))}
      </video>

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <span>{!loaded ? 'Finding a stream...' : switching ? 'Switching...' : 'Loading...'}</span>
        </div>
      )}
      {paused && !loading && panel === null && <div className="paused">❚❚</div>}
      {badge && <div className="badge">{badge}</div>}

      {loaded && (overlay || panel !== null || paused) && (
        <div className="chrome">
          <div className="top">
            <div className="show-title">{loaded.info.title}</div>
            <div className="muted">Episode {ep}{title ? ` · ${title}` : ''}</div>
          </div>
          <div className="bottom">
            <div className="sections">
              {(bar.length ? bar : [{ kind: 'main' as const, start: 0, end: time.total || 1 }]).map((s) => {
                const size = s.end - s.start
                const fill = (to: number) => `${Math.max(0, Math.min(1, (to - s.start) / size)) * 100}%`
                return (
                  <div key={`${s.kind}-${s.start}`} className={`section ${s.kind}`} style={{ flexGrow: size }}>
                    {s.kind !== 'main' && <span>{sectionLabels[s.kind]}</span>}
                    <div className="buffered" style={{ width: fill(time.buffered) }} />
                    <div className="played" style={{ width: fill(time.now) }} />
                  </div>
                )
              })}
              <div className="knob" style={{ left: `${pct(time.now)}%` }} />
            </div>
            <div className="meta">
              <span>{format(time.now)} / {format(time.total)}</span>
              <span className="muted">{[stream?.provider, stream?.quality, loaded.lang.toUpperCase()].filter(Boolean).join(' · ')}</span>
            </div>
            <div className="hints muted">OK {paused ? 'Play' : 'Pause'} · ◀ ▶ 10 s · ⏪ ⏩ 30 s · ▼ Settings · Back Exit</div>
          </div>
        </div>
      )}

      {undoIntro && showPrompt && <div className="skip">Skipped intro · Back to watch it</div>}
      {skip && !undoIntro && showPrompt && <div className="skip">Skip {skip.kind === 'op' ? 'intro' : 'outro'} (OK)</div>}
      {countdown !== null && next && (
        <div className="up-next">
          {next.thumbnail && <img src={next.thumbnail} alt="" />}
          <div>
            <div className="muted">Up next in {countdown}</div>
            <div className="up-title">{next.label}</div>
            <div className="muted small">OK to play now · Back to cancel</div>
          </div>
        </div>
      )}

      {panel !== null && (
        <div className="panel">
          <h2>Settings</h2>
          {rows.map((row, i) => (
            <div key={row.label} className={`panel-row ${i === panel ? 'focused' : ''} ${row.change ? '' : 'fixed'}`}>
              <span>{row.label}</span>
              <span>{row.change && i === panel ? `‹ ${row.value} ›` : row.value}</span>
            </div>
          ))}
          <p className="muted small">▲ ▼ choose · ◀ ▶ change · Back close</p>
        </div>
      )}
    </div>
  )
}
