import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Details, details } from '../anilist/api'
import { aniskip, mergeSkips } from '../aniskip'
import { AuthError } from '../http'
import { keyAction } from '../nav/keys'
import { useRouter } from '../nav/router'
import { attachStream } from '../player/attach'
import { activeSkip, countdownAt, nextStreamIndex, providers, qualityLabel, scrubStep, sections, shouldMarkWatched, shouldSaveResume, statusAfter } from '../player/logic'
import { playableUrl } from '../player/proxy'
import { clearResume, getResume, setResume } from '../player/resume'
import { getSettings, saveSettings, type Settings } from '../settings'
import { resolveFirst, streamsWithFallback } from '../sources/registry'
import type { Episode, SkipRange, SourceAdapter, SourceShow, Stream } from '../sources/types'
import { saveEverywhere } from '../sync/writer'
import type { Lang } from '../types'
import { Icon } from '../ui/Icon'

interface Loaded {
  info: Details
  adapter: SourceAdapter
  show: SourceShow
  streams: Stream[]
  lang: Lang
  total: number
  episodes: Episode[]
}

interface Option {
  label: string
  detail?: string
}

interface Row {
  label: string
  value: string
  options?: Option[]
  current?: number
  pick?: (i: number) => void
  toggle?: () => void
  on?: boolean
}

interface Scrub {
  origin: number
  target: number
  resume: boolean
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

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
  const [countdownFrom, setCountdownFrom] = useState(5)
  const [fallbackSkip, setFallbackSkip] = useState<SkipRange[]>([])
  const [undoIntro, setUndoIntro] = useState<SkipRange | null>(null)
  const [panel, setPanel] = useState<{ row: number; list: number | null } | null>(null)
  const [scrub, setScrub] = useState<Scrub | null>(null)
  const [drawnAt, setDrawnAt] = useState<number | null>(null)
  const [thumbWorks, setThumbWorks] = useState(true)
  const blackDraws = useRef(0)
  const scrubRef = useRef<Scrub | null>(null)
  const scrubTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastKeyAt = useRef(0)
  const holdCount = useRef(0)
  const thumb = useRef<HTMLCanvasElement>(null)
  const panelRows = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRows.current?.querySelector('.focused')?.scrollIntoView({ block: 'nearest' })
  }, [panel])
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
    const qualities = sameProvider.map(({ s }, n) => {
      const q = qualityLabel(s.quality)
      const backups = sameProvider.slice(0, n).filter((o) => qualityLabel(o.s.quality).label === q.label).length
      return { label: backups ? `${q.label}, backup ${backups}` : q.label, detail: q.detail }
    })
    const audio = [
      { label: 'Japanese', detail: 'With English subtitles' },
      { label: 'English', detail: 'Dubbed' },
    ]
    const serverDetail = (name: string) => {
      const best = Math.max(0, ...loaded.streams.filter((s) => s.provider === name).map((s) => Number(s.quality?.match(/\d+/)?.[0] ?? 0)))
      return best ? `Up to ${best}p` : 'Adjusts to your connection'
    }
    const subCurrent = chosenSub ? subs.indexOf(chosenSub) + 1 : 0
    return [
      { label: 'Audio', value: audio[loaded.lang === 'sub' ? 0 : 1].label, options: audio, current: loaded.lang === 'sub' ? 0 : 1, pick: (i) => void switchLang(i === 0 ? 'sub' : 'dub') },
      { label: 'Server', value: capitalize(stream.provider), options: names.map((n) => ({ label: capitalize(n), detail: serverDetail(n) })), current: names.indexOf(stream.provider), pick: (i) => switchStream(loaded.streams.findIndex((s) => s.provider === names[i])) },
      { label: 'Quality', value: qualities[sameProvider.findIndex((o) => o.i === index)]?.label ?? 'Automatic', options: qualities, current: sameProvider.findIndex((o) => o.i === index), pick: (i) => switchStream(sameProvider[i].i) },
      subs.length
        ? { label: 'Subtitles', value: chosenSub?.label ?? 'Off', options: [{ label: 'Off' }, ...subs.map((s) => ({ label: s.label }))], current: subCurrent, pick: (i) => setSubChoice(i === 0 ? 'off' : subs[i - 1].label) }
        : { label: 'Subtitles', value: loaded.lang === 'sub' ? 'Part of the video' : 'None' },
      { label: 'Skip intros', value: '', on: prefs.autoSkipIntro, toggle: () => updatePrefs({ autoSkipIntro: !prefs.autoSkipIntro }) },
      { label: 'Play next episode', value: '', on: prefs.autoplayNext, toggle: () => updatePrefs({ autoplayNext: !prefs.autoplayNext }) },
    ]
  }, [loaded, stream, index, subs, chosenSub, prefs, switchLang, switchStream, updatePrefs])

  const drawThumb = useCallback(() => {
    const el = video.current
    const ctx = thumb.current?.getContext('2d')
    if (!el || !ctx) return
    try {
      ctx.drawImage(el, 0, 0, ctx.canvas.width, ctx.canvas.height)
      setDrawnAt(el.currentTime)
    } catch {
      return setThumbWorks(false)
    }
    try {
      const pixels = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data
      let lit = 0
      for (let i = 0; i < pixels.length; i += 4096) lit += pixels[i] + pixels[i + 1] + pixels[i + 2]
      blackDraws.current = lit === 0 ? blackDraws.current + 1 : 0
      if (blackDraws.current >= 3) setThumbWorks(false)
    } catch {
      return
    }
  }, [])

  const endScrub = useCallback((to: 'target' | 'origin') => {
    const el = video.current
    const s = scrubRef.current
    clearTimeout(scrubTimer.current)
    if (!el || !s) return
    scrubRef.current = null
    setScrub(null)
    setDrawnAt(null)
    el.currentTime = to === 'target' ? s.target : s.origin
    if (s.resume) void el.play().catch(() => undefined)
  }, [])

  const moveScrub = useCallback((dir: 1 | -1, base?: number) => {
    const el = video.current
    if (!el || !(el.duration > 0)) return
    const now = performance.now()
    holdCount.current = now - lastKeyAt.current < 350 ? holdCount.current + 1 : 0
    lastKeyAt.current = now
    const step = base ?? scrubStep(holdCount.current)
    const current = scrubRef.current ?? { origin: el.currentTime, target: el.currentTime, resume: !el.paused }
    if (!scrubRef.current) el.pause()
    const updated = { ...current, target: Math.max(0, Math.min(el.duration - 1, current.target + dir * step)) }
    scrubRef.current = updated
    setScrub(updated)
    if (!el.seeking) el.currentTime = updated.target
    clearTimeout(scrubTimer.current)
    scrubTimer.current = setTimeout(() => endScrub('target'), 900)
  }, [endScrub])

  const onSeeked = () => {
    setBuffering(false)
    const el = video.current
    const s = scrubRef.current
    if (!el || !s) return
    drawThumb()
    if (Math.abs(el.currentTime - s.target) > 0.5) el.currentTime = s.target
  }

  useEffect(() => () => clearTimeout(scrubTimer.current), [])

  useEffect(() => {
    setBackHandler(() => {
      if (panel?.list != null) {
        setPanel({ row: panel.row, list: null })
        return true
      }
      if (panel) {
        setPanel(null)
        return true
      }
      if (scrubRef.current) {
        endScrub('origin')
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
  }, [panel, countdown, undoIntro, endScrub, setBackHandler])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = video.current
      if (!el) return
      const action = keyAction(e)
      if (action === 'back') return
      if (panel) {
        const row = rows[panel.row]
        if (panel.list !== null && row?.options) {
          if (e.key === 'ArrowUp') setPanel({ ...panel, list: Math.max(0, panel.list - 1) })
          else if (e.key === 'ArrowDown') setPanel({ ...panel, list: Math.min(row.options.length - 1, panel.list + 1) })
          else if (e.key === 'Enter' || e.key === 'ArrowRight') {
            if (panel.list !== row.current) row.pick?.(panel.list)
            setPanel({ ...panel, list: null })
          }
          else if (e.key === 'ArrowLeft') setPanel({ ...panel, list: null })
          else return
        }
        else if (e.key === 'ArrowUp') setPanel({ row: Math.max(0, panel.row - 1), list: null })
        else if (e.key === 'ArrowDown') setPanel({ row: Math.min(rows.length - 1, panel.row + 1), list: null })
        else if (e.key === 'Enter' || e.key === 'ArrowRight') {
          if (row?.toggle) row.toggle()
          else if (row?.options && row.options.length > 1) setPanel({ ...panel, list: Math.max(0, row.current ?? 0) })
        }
        else if (e.key === 'ArrowLeft') setPanel(null)
        else return
      }
      else if (e.key === 'ArrowLeft') moveScrub(-1)
      else if (e.key === 'ArrowRight') moveScrub(1)
      else if (action === 'rw') moveScrub(-1, 30)
      else if (action === 'ff') moveScrub(1, 30)
      else if (scrubRef.current && (e.key === 'Enter' || action === 'playpause' || action === 'play')) endScrub('target')
      else if (countdown !== null && e.key === 'Enter') playNext()
      else if (e.key === 'Enter' && skip) el.currentTime = skip.end
      else if (e.key === 'Enter' || action === 'playpause') { if (el.paused) void el.play(); else el.pause() }
      else if (action === 'play') void el.play()
      else if (action === 'pause') el.pause()
      else if (action === 'stop') back()
      else if (e.key === 'ArrowDown') { if (loaded) setPanel({ row: 0, list: null }) }
      else if (e.key !== 'ArrowUp') return
      e.preventDefault()
      e.stopPropagation()
      setOverlay(true)
      setActivity((a) => a + 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [panel, rows, skip, countdown, playNext, back, loaded, moveScrub, endScrub])

  const onTime = () => {
    const el = video.current
    if (!el || !loaded || scrubRef.current) return
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
      setCountdownFrom(5)
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
    if (next && prefs.autoplayNext) {
      setCountdownFrom(10)
      setCountdown(10)
    }
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
  const loading = !loaded || (buffering && !scrub) || switching
  const pct = (s: number) => (time.total ? (s / time.total) * 100 : 0)
  const showPrompt = countdown === null && panel === null && !scrub
  const position = scrub?.target ?? time.now
  const scrubSection = scrub ? bar.find((b) => scrub.target >= b.start && scrub.target < b.end) : undefined
  const delta = scrub ? scrub.target - scrub.origin : 0

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
        onSeeked={onSeeked}
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
      {paused && !loading && panel === null && !scrub && <div className="paused"><Icon name="pause" size={64} /></div>}
      {badge && <div className="badge">{badge}</div>}

      {loaded && (overlay || panel !== null || paused || scrub) && (
        <div className="chrome">
          <div className="top">
            <div className="show-title">{loaded.info.title}</div>
            <div className="muted">Episode {ep}{title ? ` · ${title}` : ''}</div>
          </div>
          <div className="bottom">
            <div className="scrubber">
              {scrub && (
                <div className={`preview ${drawnAt === null || Math.abs(drawnAt - scrub.target) > 2 ? 'stale' : ''}`} style={{ left: `clamp(180px, ${pct(scrub.target)}%, calc(100% - 180px))` }}>
                  <canvas ref={thumb} width={320} height={180} hidden={!thumbWorks} />
                  <div className="preview-time">{format(scrub.target)}</div>
                  <div className="preview-meta">{[scrubSection && sectionLabels[scrubSection.kind], `${delta < 0 ? '−' : '+'}${format(Math.abs(delta))}`].filter(Boolean).join(' · ')}</div>
                </div>
              )}
              <div className="sections">
                {(bar.length ? bar : [{ kind: 'main' as const, start: 0, end: time.total || 1 }]).map((s) => {
                  const size = s.end - s.start
                  const fill = (to: number) => `${Math.max(0, Math.min(1, (to - s.start) / size)) * 100}%`
                  return (
                    <div key={`${s.kind}-${s.start}`} className={`section ${s.kind}`} style={{ flexGrow: size }}>
                      {s.kind !== 'main' && <span>{sectionLabels[s.kind]}</span>}
                      <div className="buffered" style={{ width: fill(time.buffered) }} />
                      <div className="played" style={{ width: fill(position) }} />
                    </div>
                  )
                })}
                {scrub && <div className="origin" style={{ left: `${pct(scrub.origin)}%` }} />}
                <div className={`knob ${scrub ? 'active' : ''}`} style={{ left: `${pct(position)}%` }} />
              </div>
            </div>
            <div className="meta">
              <span className="clock">{format(position)} <span className="muted">/ {format(time.total)}</span></span>
              <span className="muted">{[stream && capitalize(stream.provider), stream && qualityLabel(stream.quality).label, loaded.lang === 'sub' ? 'Japanese' : 'English'].filter(Boolean).join(' · ')}</span>
            </div>
            <div className="hints">
              {scrub ? (
                <>
                  <span><kbd>OK</kbd> Jump here</span>
                  <span><kbd><Icon name="back" size={20} /></kbd> Cancel</span>
                </>
              ) : (
                <>
                  <span><kbd>OK</kbd> {paused ? 'Play' : 'Pause'}</span>
                  <span><kbd><Icon name="left" size={20} /><Icon name="right" size={20} /></kbd> Hold to scrub</span>
                  <span><kbd><Icon name="down" size={20} /></kbd> Settings</span>
                  <span><kbd><Icon name="back" size={20} /></kbd> Exit</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {undoIntro && showPrompt && <div className="prompt quiet">Intro skipped <span className="hint"><kbd><Icon name="back" size={20} /></kbd> Watch it</span></div>}
      {skip && !undoIntro && showPrompt && <div className="prompt"><kbd>OK</kbd> Skip {skip.kind === 'op' ? 'intro' : 'outro'}</div>}
      {countdown !== null && next && (
        <div className="up-next">
          {next.thumbnail && <img src={next.thumbnail} alt="" />}
          <div className="up-body">
            <div className="up-title">{next.label}</div>
            <div className="up-count">Starts in {countdown}</div>
            <div className="hints">
              <span><kbd>OK</kbd> Play now</span>
              <span><kbd><Icon name="back" size={20} /></kbd> Cancel</span>
            </div>
          </div>
          <div className="up-timer" key={next.ep} style={{ animationDuration: `${countdownFrom}s` }} />
        </div>
      )}

      {panel && (
        <div className="panel">
          <h2>Playback</h2>
          <div className="panel-rows" ref={panelRows}>
          {rows.map((row, i) => {
            const open = i === panel.row && panel.list !== null && row.options
            const expandable = !row.toggle && (row.options?.length ?? 0) > 1
            return (
              <div key={row.label} className="panel-group">
                <div className={`panel-row ${i === panel.row && panel.list === null ? 'focused' : ''} ${open ? 'open' : ''} ${row.toggle || expandable ? '' : 'fixed'}`}>
                  <span>{row.label}</span>
                  {row.toggle ? (
                    <span className={`switch ${row.on ? 'on' : ''}`}><span /></span>
                  ) : (
                    <span className="value">
                      {row.value}
                      {expandable && <span className={`chev ${open ? 'up' : ''}`}><Icon name="down" size={22} /></span>}
                    </span>
                  )}
                </div>
                {open && (
                  <div className="options">
                    {row.options!.map((o, n) => (
                      <div key={o.label} className={`option ${n === panel.list ? 'focused' : ''} ${n === row.current ? 'current' : ''}`}>
                        <span className="tick">{n === row.current && <Icon name="check" size={22} />}</span>
                        <span>
                          <span className="option-label">{o.label}</span>
                          {o.detail && <span className="option-detail">{o.detail}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          </div>
          <div className="hints panel-hints">
            {panel.list !== null ? (
              <>
                <span><kbd>OK</kbd> Choose</span>
                <span><kbd><Icon name="back" size={20} /></kbd> Close list</span>
              </>
            ) : (
              <>
                <span><kbd>OK</kbd> {rows[panel.row]?.toggle ? 'Turn on or off' : 'Open'}</span>
                <span><kbd><Icon name="back" size={20} /></kbd> Close</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
