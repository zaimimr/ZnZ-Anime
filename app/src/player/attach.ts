import Hls from 'hls.js'

const STUCK_SECONDS = 12
const SRC_NOT_SUPPORTED = 4

export function nativePlayback(el: HTMLVideoElement, format: 'hls' | 'mp4'): boolean {
  if (format !== 'hls') return true
  if (window.tizen && el.canPlayType('application/vnd.apple.mpegurl')) return true
  return !Hls.isSupported()
}

function watchStalls(el: HTMLVideoElement, onStall: () => void): () => void {
  let stuck = 0
  let last = -1
  const timer = setInterval(() => {
    stuck = !document.hidden && !el.paused && !el.ended && el.currentTime === last ? stuck + 1 : 0
    last = el.currentTime
    if (stuck < STUCK_SECONDS) return
    stuck = 0
    onStall()
  }, 1000)
  return () => clearInterval(timer)
}

export function attachStream(el: HTMLVideoElement, url: string, format: 'hls' | 'mp4', onFatal: (blocked: boolean) => void): () => void {
  const unwatch = watchStalls(el, () => onFatal(false))
  if (nativePlayback(el, format)) {
    el.onerror = () => onFatal(el.error?.code === SRC_NOT_SUPPORTED)
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
