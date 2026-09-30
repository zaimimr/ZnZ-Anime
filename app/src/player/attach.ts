import Hls from 'hls.js'

export function attachStream(el: HTMLVideoElement, url: string, format: 'hls' | 'mp4', onFatal: (blocked: boolean) => void): () => void {
  if (format !== 'hls' || !Hls.isSupported()) {
    el.onerror = () => onFatal(false)
    el.src = url
    return () => {
      el.onerror = null
    }
  }
  let recoveries = 0
  const hls = new Hls({ maxBufferLength: 60 })
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
  return () => hls.destroy()
}
