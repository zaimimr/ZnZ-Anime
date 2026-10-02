import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { type Details, details } from '../anilist/api'
import { aniskip, mergeSkips } from '../aniskip'
import { recordPlay } from '../history'
import { hosts } from '../hosts'
import { type LibraryEntry, libraryEntry } from '../library'
import { keyAction } from '../nav/keys'
import { useRouter } from '../nav/router'
import { attachStream } from '../player/attach'
import { activeSkip, countdownAt, hasSceneAfterOutro, healthyStreams, knownDuration, nearEnd, nextEpisode, qualityChoices, nextStreamIndex, preferredIndex, providers, qualityLabel, reachableStreams, resumePoint, scrubStep, sections, shouldMarkWatched, shouldSaveResume, statusAfter } from '../player/logic'
import { playableUrl, streamWorks } from '../player/proxy'
import { loadThumbs, thumbAt, type ThumbCue } from '../player/thumbnails'
import { clearResume, getResume, getServer, setResume, setServer } from '../player/resume'
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
  entry: LibraryEntry | null
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
  streams?: number[]
  langs?: Lang[]
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
  if (window.tizen) return 0
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
  const [matchedSkip, setMatchedSkip] = useState<{ length: number; ranges: SkipRange[] }>({ length: 0, ranges: [] })
  const [undoSkip, setUndoSkip] = useState<SkipRange | null>(null)
  const [finished, setFinished] = useState(false)
  const [panel, setPanel] = useState<{ row: string; list: number | null } | null>(null)
  const [scrub, setScrub] = useState<Scrub | null>(null)
  const [thumbState, setThumbs] = useState<{ src: string; cues: ThumbCue[] }>({ src: '', cues: [] })
  const [otherState, setOtherLang] = useState<{ of: Loaded | null; ok: boolean }>({ of: null, ok: false })
  const [skipLength, setSkipLength] = useState(0)
  const scrubRef = useRef<Scrub | null>(null)
  const pendingSeek = useRef<{ target: number; retried: boolean } | null>(null)
  const scrubTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastKeyAt = useRef(0)
  const holdCount = useRef(0)
  const panelRows = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRows.current?.querySelector('.focused')?.scrollIntoView({ block: 'nearest' })
  }, [panel])
  const [prefs, setPrefs] = useState<Settings>(getSettings())
  const [subChoice, setSubChoice] = useState<string | null>(null)
  const marked = useRef(false)
  const skipped = useRef<Record<'op' | 'ed', 'pending' | 'skipped' | 'watching'>>({ op: 'pending', ed: 'pending' })
  const countdownFired = useRef(false)
  const countdownActive = useRef(false)
  const startAt = useRef(getResume(id, ep))
  const fromSave = useRef(true)
  const holdResume = useRef(0)
  const inFlight = useRef(false)
  const latest = useRef<Loaded | null>(null)
  const triedAdapters = useRef<string[]>([])
  const reloadedAt = useRef<number | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    latest.current = loaded
  }, [loaded])

  const load = useCallback((skipAdapters: string[]) => {
    if (inFlight.current) return
    inFlight.current = true
    const run = async (skip: string[]): Promise<void> => {
      const info = await details(id)
      const [found, entry] = await Promise.all([
        resolveFirst({ anilistId: id, titles: info.titles }, skip),
        libraryEntry(info).catch(() => null),
      ])
      if (!found) return setError('No source available.')
      triedAdapters.current = [...skip, found.adapter.id]
      const wanted = getSettings().lang
      const result = await streamsWithFallback(found.adapter, found.show, ep, wanted)
      const { lang } = result
      const reachable = reachableStreams(result.streams, Boolean(hosts.auth))
      if (!reachable.length && result.streams.length) return setError('This episode needs your server. Add it in Settings > Server.')
      const streams = await healthyStreams(reachable, (s) => streamWorks(playableUrl(s.url, s.headers), s.format))
      if (!streams.length) return run(triedAdapters.current)
      if (lang !== wanted) setBadge(`${wanted.toUpperCase()} not available, playing ${lang.toUpperCase()}`)
      setIndex(preferredIndex(streams, getServer(id)))
      setLoaded({ info, adapter: found.adapter, show: found.show, streams, lang, total: info.episodes ?? found.episodes.length, episodes: found.episodes, entry })
    }
    run(skipAdapters)
      .catch(() => setError('The sources are not responding. Try again in a moment.'))
      .finally(() => { inFlight.current = false })
  }, [id, ep])

  useEffect(() => {
    load([])
  }, [load])

  const malId = loaded?.info.idMal
  useEffect(() => {
    if (!malId || !skipLength) return
    let live = true
    aniskip(malId, ep, skipLength).then((r) => live && setMatchedSkip({ length: skipLength, ranges: r })).catch(() => undefined)
    return () => { live = false }
  }, [malId, ep, skipLength])

  const keepPosition = useCallback(() => {
    const now = video.current?.currentTime
    if (!now || now < holdResume.current) return
    startAt.current = now
    fromSave.current = false
  }, [])

  const stream = loaded?.streams[index]
  const subs = useMemo(() => stream?.subtitles ?? [], [stream])
  const chosenSub = subChoice === 'off' ? null : (subs.find((s) => s.label === subChoice) ?? subs.find((s) => /^en/i.test(s.lang) || /english/i.test(s.label)) ?? subs.find((s) => s.default) ?? subs[0] ?? null)

  useEffect(() => {
    const tracks = video.current?.textTracks
    if (!tracks) return
    const apply = () => {
      for (const t of Array.from(tracks)) {
        if (t.kind !== 'subtitles' && t.kind !== 'captions') continue
        t.mode = chosenSub && t.label === chosenSub.label ? 'showing' : 'disabled'
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

  const markWatched = useCallback(() => {
    const entry = loaded?.entry
    if (!loaded || !entry || marked.current || ep <= entry.progress) return
    marked.current = true
    void saveEverywhere({ anilistId: id, malId: loaded.info.idMal, status: statusAfter(ep, loaded.info.episodes, entry.status), progress: ep, score: entry.score }).catch(() => { marked.current = false })
  }, [loaded, id, ep])

  const saveProgress = useEffectEvent(() => {
    const el = video.current
    if (finished || !el || !shouldSaveResume(el, holdResume.current)) return
    holdResume.current = 0
    const done = shouldMarkWatched(el.currentTime, el.duration)
    if (done) {
      clearResume(id, ep)
      markWatched()
    }
    else setResume(id, ep, el.currentTime)
    recordPlay(id, ep, done)
  })

  useEffect(() => {
    const timer = setInterval(saveProgress, 5000)
    return () => clearInterval(timer)
  }, [])

  const next = useMemo(() => {
    if (!loaded) return null
    const n = nextEpisode(loaded.episodes, ep, loaded.total, prefs.skipFiller)
    if (n !== null) {
      const upcoming = loaded.episodes.find((e) => e.number === n)
      return { id, ep: n, label: `Episode ${n}${upcoming?.title ? ` · ${upcoming.title}` : ''}`, thumbnail: upcoming?.thumbnail }
    }
    const finale = loaded.info.episodes !== undefined && ep >= loaded.info.episodes
    const sequel = finale ? loaded.info.related.find((r) => r.relation === 'Sequel' && r.released) : undefined
    return sequel ? { id: sequel.id, ep: 1, label: sequel.title, thumbnail: sequel.cover } : null
  }, [loaded, id, ep, prefs.skipFiller])

  const playNext = useCallback(() => {
    if (!next) return
    markWatched()
    clearResume(id, ep)
    recordPlay(id, ep, true)
    replace({ name: 'player', id: next.id, ep: next.ep })
  }, [next, markWatched, replace, id, ep])

  useEffect(() => {
    countdownActive.current = countdown !== null
    if (countdown === null || (paused && !finished)) return
    if (countdown === 0) return playNext()
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown, paused, finished, playNext])

  const finish = () => {
    if (finished) return
    setFinished(true)
    clearResume(id, ep)
    recordPlay(id, ep, true)
    video.current?.pause()
    markWatched()
    if (next && prefs.autoplayNext && countdown === null) {
      countdownFired.current = true
      setCountdownFrom(10)
      setCountdown(10)
    }
  }

  const nextStream = (skipProvider: boolean) => {
    if (!loaded) return
    const el = video.current
    if (countdownActive.current || (el && nearEnd(el.currentTime, el.duration))) return finish()
    keepPosition()
    const next = nextStreamIndex(loaded.streams, index, skipProvider)
    setBadge('This server stopped working, trying another one')
    if (next >= 0) setIndex(next)
    else load(triedAdapters.current)
  }

  const recover = useEffectEvent((blocked: boolean) => {
    const el = video.current
    if (inFlight.current || error) return
    if (blocked || reloadedAt.current !== null || !el) return nextStream(blocked)
    reloadedAt.current = el.currentTime
    keepPosition()
    setBadge('Reconnecting')
    setAttempt((a) => a + 1)
  })

  useEffect(() => {
    reloadedAt.current = null
  }, [loaded, index])

  useEffect(() => {
    const stream = loaded?.streams[index]
    const el = video.current
    if (!loaded || !stream || !el) return
    setBuffering(true)
    const detach = attachStream(el, playableUrl(stream.url, stream.headers, loaded.lang), stream.format, (blocked) => recover(blocked))
    void el.play().catch(() => undefined)
    return detach
  }, [loaded, index, attempt])

  const ranges = useMemo(() => mergeSkips(stream?.skip ?? loaded?.episodes.find((e) => e.number === ep)?.skip, matchedSkip.length === skipLength ? matchedSkip.ranges : [], time.total || Infinity), [stream, loaded, ep, matchedSkip, skipLength, time.total])
  const skip = activeSkip(ranges, time.now)
  const bar = useMemo(() => sections(ranges, time.total), [ranges, time.total])

  useEffect(() => {
    if (!undoSkip) return
    const timer = setTimeout(() => setUndoSkip(null), 5000)
    return () => clearTimeout(timer)
  }, [undoSkip])

  const updatePrefs = useCallback((change: Partial<Settings>) => {
    const updated = { ...getSettings(), ...change }
    saveSettings(updated)
    setPrefs(updated)
  }, [])

  const switchStream = useCallback((i: number) => {
    keepPosition()
    setIndex(i)
  }, [keepPosition])

  const switchLang = useCallback(async (lang: Lang) => {
    if (!loaded) return
    const before = loaded
    keepPosition()
    setSwitching(true)
    try {
      const result = await streamsWithFallback(before.adapter, before.show, ep, lang)
      const reachable = reachableStreams(result.streams, Boolean(hosts.auth))
      if (result.lang !== lang || !reachable.length) return setBadge(`${lang.toUpperCase()} not available for this episode`)
      const streams = await healthyStreams(reachable, (s) => streamWorks(playableUrl(s.url, s.headers), s.format))
      if (latest.current !== before) return
      updatePrefs({ lang })
      setIndex(preferredIndex(streams, before.streams[index]?.provider ?? null))
      setLoaded((current) => (current === before ? { ...before, streams, lang } : current))
    } catch {
      setBadge(`Could not load ${lang.toUpperCase()}`)
    } finally {
      setSwitching(false)
    }
  }, [loaded, ep, index, updatePrefs, keepPosition])

  const rows = useMemo((): Row[] => {
    if (!loaded || !stream) return []
    const names = providers(loaded.streams)
    const sameProvider = loaded.streams.map((s, i) => ({ s, i })).filter(({ s }) => s.provider === stream.provider)
    const qualities = qualityChoices(sameProvider.map((o) => o.s)).map((q) => ({ ...q, detail: qualityLabel(q.label).detail, stream: sameProvider[q.index].i }))
    const audio = [
      { label: 'Japanese', detail: 'With English subtitles' },
      { label: 'English', detail: 'Dubbed' },
    ]
    const serverDetail = (name: string) => {
      const best = Math.max(0, ...loaded.streams.filter((s) => s.provider === name).map((s) => Number(s.quality?.match(/\d+/)?.[0] ?? 0)))
      return best ? `Up to ${best}p` : 'Adjusts to your connection'
    }
    const qualityCurrent = qualities.findIndex((q) => q.label === qualityLabel(stream.quality).label)
    const result: Row[] = []
    if (otherState.of === loaded && otherState.ok) result.push({ label: 'Audio', value: audio[loaded.lang === 'sub' ? 0 : 1].label, options: audio, current: loaded.lang === 'sub' ? 0 : 1, langs: ['sub', 'dub'] })
    if (names.length > 1) result.push({ label: 'Server', value: capitalize(stream.provider), options: names.map((n) => ({ label: capitalize(n), detail: serverDetail(n) })), current: names.indexOf(stream.provider), streams: names.map((n) => loaded.streams.findIndex((s) => s.provider === n)) })
    if (qualities.length > 1) result.push({ label: 'Quality', value: qualities[qualityCurrent]?.label ?? 'Automatic', options: qualities, current: qualityCurrent, streams: qualities.map((q) => q.stream) })
    if (subs.length) result.push({ label: 'Subtitles', value: chosenSub?.label ?? 'Off', options: [{ label: 'Off' }, ...subs.map((s) => ({ label: s.label }))], current: chosenSub ? subs.indexOf(chosenSub) + 1 : 0, pick: (i) => setSubChoice(i === 0 ? 'off' : subs[i - 1].label) })
    result.push({ label: 'Skip intros', value: '', on: prefs.autoSkipIntro, toggle: () => updatePrefs({ autoSkipIntro: !prefs.autoSkipIntro }) })
    result.push({ label: 'Skip outros', value: '', on: prefs.autoSkipOutro, toggle: () => updatePrefs({ autoSkipOutro: !prefs.autoSkipOutro }) })
    if (loaded.episodes.some((e) => e.filler)) result.push({ label: 'Skip filler episodes', value: '', on: prefs.skipFiller, toggle: () => updatePrefs({ skipFiller: !prefs.skipFiller }) })
    result.push({ label: 'Play next episode', value: '', on: prefs.autoplayNext, toggle: () => updatePrefs({ autoplayNext: !prefs.autoplayNext }) })
    return result
  }, [loaded, stream, subs, chosenSub, prefs, otherState, updatePrefs])

  useEffect(() => {
    if (!loaded) return
    const other: Lang = loaded.lang === 'sub' ? 'dub' : 'sub'
    let live = true
    loaded.adapter.stream(loaded.show, ep, other).then((s) => live && setOtherLang({ of: loaded, ok: s.length > 0 })).catch(() => undefined)
    return () => { live = false }
  }, [loaded, ep])

  const thumbSource = stream?.thumbnails ? stream : loaded?.streams.find((s) => s.thumbnails)
  useEffect(() => {
    const src = thumbSource?.thumbnails
    if (!src) return
    let live = true
    loadThumbs(src, thumbSource.headers)
      .then((cues) => {
        if (!live) return
        setThumbs({ src, cues })
        for (const url of new Set(cues.map((c) => c.url))) new Image().src = url
      })
      .catch(() => undefined)
    return () => { live = false }
  }, [thumbSource])
  const thumbs = thumbSource?.thumbnails && thumbState.src === thumbSource.thumbnails ? thumbState.cues : []

  const endScrub = useCallback((to: 'target' | 'origin') => {
    const el = video.current
    const s = scrubRef.current
    clearTimeout(scrubTimer.current)
    if (!el || !s) return
    scrubRef.current = null
    setScrub(null)
    const goal = to === 'target' ? s.target : s.origin
    holdResume.current = 0
    if (!nearEnd(goal, el.duration)) {
      setFinished(false)
      countdownFired.current = false
      setCountdown(null)
    }
    pendingSeek.current = { target: goal, retried: false }
    el.currentTime = goal
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
    clearTimeout(scrubTimer.current)
    scrubTimer.current = setTimeout(() => endScrub('target'), 900)
  }, [endScrub])

  const onSeeked = () => {
    setBuffering(false)
    const el = video.current
    const seek = pendingSeek.current
    if (!el || !seek) return
    if (Math.abs(el.currentTime - seek.target) > 2 && !seek.retried) {
      seek.retried = true
      el.currentTime = seek.target
      return
    }
    pendingSeek.current = null
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
      if (undoSkip && video.current) {
        video.current.currentTime = undoSkip.start
        skipped.current[undoSkip.kind] = 'watching'
        setUndoSkip(null)
        return true
      }
      return false
    })
    return () => setBackHandler(null)
  }, [panel, countdown, undoSkip, endScrub, setBackHandler])

  useEffect(() => {
    const choose = (row: Row, i: number) => {
      if (row.streams) switchStream(row.streams[i])
      else if (row.langs) void switchLang(row.langs[i])
      else row.pick?.(i)
    }
    const onKey = (e: KeyboardEvent) => {
      const el = video.current
      if (!el) return
      const action = keyAction(e)
      if (action === 'back') return
      if (action === 'stop') {
        e.preventDefault()
        e.stopPropagation()
        return back()
      }
      if (panel) {
        const focus = Math.max(0, rows.findIndex((r) => r.label === panel.row))
        const row = rows[focus]
        if (panel.list !== null && row?.options) {
          if (e.key === 'ArrowUp') setPanel({ ...panel, list: Math.max(0, panel.list - 1) })
          else if (e.key === 'ArrowDown') setPanel({ ...panel, list: Math.min(row.options.length - 1, panel.list + 1) })
          else if (e.key === 'Enter' || e.key === 'ArrowRight') {
            if (panel.list !== row.current) choose(row, panel.list)
            setPanel({ ...panel, list: null })
          }
          else if (e.key === 'ArrowLeft') setPanel({ ...panel, list: null })
          else return
        }
        else if (e.key === 'ArrowUp') setPanel({ row: rows[Math.max(0, focus - 1)].label, list: null })
        else if (e.key === 'ArrowDown') setPanel({ row: rows[Math.min(rows.length - 1, focus + 1)].label, list: null })
        else if (e.key === 'Enter' || e.key === 'ArrowRight') {
          if (row?.toggle) row.toggle()
          else if (row?.options && row.options.length > 1) setPanel({ row: row.label, list: Math.max(0, row.current ?? 0) })
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
      else if (e.key === 'Enter' && skip) { holdResume.current = 0; el.currentTime = skip.end }
      else if (e.key === 'Enter' || action === 'playpause') { if (el.paused) void el.play(); else el.pause() }
      else if (action === 'play') void el.play()
      else if (action === 'pause') el.pause()
      else if (e.key === 'ArrowDown') { if (rows.length) setPanel({ row: rows[0].label, list: null }) }
      else if (e.key !== 'ArrowUp') return
      e.preventDefault()
      e.stopPropagation()
      setOverlay(true)
      setActivity((a) => a + 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [panel, rows, skip, countdown, playNext, back, loaded, moveScrub, endScrub, switchStream, switchLang])

  const onTime = () => {
    const el = video.current
    if (!el || !loaded || scrubRef.current) return
    const total = knownDuration(el.duration)
    setTime({ now: el.currentTime, total, buffered: bufferedEnd(el) })
    if (reloadedAt.current !== null && el.currentTime > reloadedAt.current + 30) reloadedAt.current = null
    if (total && Math.abs(total - skipLength) > 3) setSkipLength(Math.round(total))
    const range = activeSkip(ranges, el.currentTime)
    const wanted = range?.verified && (range.kind === 'op' ? prefs.autoSkipIntro : prefs.autoSkipOutro && hasSceneAfterOutro(range, el.duration))
    if (range && wanted && skipped.current[range.kind] === 'pending') {
      skipped.current[range.kind] = 'skipped'
      el.currentTime = range.end
      setUndoSkip(range)
    }
    const at = prefs.autoSkipOutro ? countdownAt(ranges, el.duration) : null
    if (next && prefs.autoplayNext && at !== null && el.currentTime >= at && !countdownFired.current) {
      countdownFired.current = true
      setCountdownFrom(5)
      setCountdown(5)
    }
  }

  const onMeta = () => {
    const el = video.current
    if (!el) return
    const target = fromSave.current ? resumePoint(startAt.current, el.duration) : startAt.current
    startAt.current = 0
    fromSave.current = false
    if (!(target > 0)) return
    holdResume.current = target
    pendingSeek.current = { target, retried: false }
    el.currentTime = target
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
  const cue = scrub ? thumbAt(thumbs, scrub.target) : undefined
  const focus = panel ? Math.max(0, rows.findIndex((r) => r.label === panel.row)) : -1

  return (
    <div className="player">
      <video
        ref={video}
        crossOrigin="anonymous"
        onTimeUpdate={onTime}
        onLoadedMetadata={onMeta}
        onEnded={finish}
        onLoadStart={() => setBuffering(true)}
        onWaiting={() => setBuffering(true)}
        onSeeking={() => setBuffering(true)}
        onPlaying={() => { setBuffering(false); if (stream) setServer(id, stream.provider) }}
        onCanPlay={() => setBuffering(false)}
        onSeeked={onSeeked}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onProgress={(e) => { const buffered = bufferedEnd(e.currentTarget); setTime((t) => ({ ...t, buffered })) }}
        autoPlay
      >
        {stream?.subtitles.map((sub) => (
          <track key={sub.url} kind="subtitles" src={playableUrl(sub.url, stream.headers)} srcLang={sub.lang} label={sub.label} default={sub === chosenSub} />
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
                <div className="preview" style={{ left: `clamp(180px, ${pct(scrub.target)}%, calc(100% - 180px))` }}>
                  {cue && (
                    <div className="frame">
                      <div style={{ width: cue.w, height: cue.h, transform: `scale(${336 / cue.w}, ${189 / cue.h})`, backgroundImage: `url("${cue.url}")`, backgroundPosition: `-${cue.x}px -${cue.y}px` }} />
                    </div>
                  )}
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

      {undoSkip && showPrompt && <div className="prompt quiet">{undoSkip.kind === 'op' ? 'Intro' : 'Outro'} skipped <span className="hint"><kbd><Icon name="back" size={20} /></kbd> Watch it</span></div>}
      {skip && !undoSkip && showPrompt && <div className="prompt"><kbd>OK</kbd> Skip {skip.kind === 'op' ? 'intro' : 'outro'}</div>}
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
            const open = i === focus && panel.list !== null && row.options
            const expandable = !row.toggle && (row.options?.length ?? 0) > 1
            return (
              <div key={row.label} className="panel-group">
                <div className={`panel-row ${i === focus && panel.list === null ? 'focused' : ''} ${open ? 'open' : ''} ${row.toggle || expandable ? '' : 'fixed'}`}>
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
                <span><kbd>OK</kbd> {rows[focus]?.toggle ? 'Turn on or off' : 'Open'}</span>
                <span><kbd><Icon name="back" size={20} /></kbd> Close</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
