import Hls from 'hls.js'

const STALL_MS = 20_000

export function nativePlayback(el: HTMLVideoElement, format: 'hls' | 'mp4'): boolean {
  if (format !== 'hls') return true
  if (window.tizen && el.canPlayType('application/vnd.apple.mpegurl')) return true
  return !Hls.isSupported()
}

function watchStalls(el: HTMLVideoElement, onStall: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const arm = () => {
    clearTimeout(timer)
    timer = setTimeout(() => !el.paused && onStall(), STALL_MS)
  }
  const disarm = () => clearTimeout(timer)
  const events: [string, () => void][] = [['waiting', arm], ['playing', disarm], ['pause', disarm], ['ended', disarm]]
  for (const [name, fn] of events) el.addEventListener(name, fn)
  arm()
  return () => {
    disarm()
    for (const [name, fn] of events) el.removeEventListener(name, fn)
  }
}

export function attachStream(el: HTMLVideoElement, url: string, format: 'hls' | 'mp4', onFatal: (blocked: boolean) => void): () => void {
  const unwatch = watchStalls(el, () => onFatal(false))
  if (nativePlayback(el, format)) {
    el.onerror = () => onFatal(false)
    el.src = url
    return () => {
      unwatch()
      el.onerror = null
      el.removeAttribute('src')
      el.load()
    }
  }
  let recoveries = 0
  const hls = new Hls({ maxBufferLength: 30, backBufferLength: 30 })
  hls.on(Hls.Events.ERROR, (_, data) => {
    if (!data.fatal) return
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoveries < 3) {
      recoveries++
      hls.recoverMediaError()
      return
    }
    onFatal(data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR || data.details === Hls.ErrorDetails.LEVEL_LOAD_ERROR)
  })
  hls.loadSource(url)
  hls.attachMedia(el)
  return () => {
    unwatch()
    hls.destroy()
  }
}
