export type KeyAction = 'back' | 'playpause' | 'play' | 'pause' | 'ff' | 'rw' | 'stop'

const byCode: Record<number, KeyAction> = { 10009: 'back', 10252: 'playpause', 415: 'play', 19: 'pause', 417: 'ff', 412: 'rw', 413: 'stop' }

export function keyAction(e: { keyCode: number; key: string }): KeyAction | null {
  if (e.key === 'Escape' || e.key === 'Backspace') return 'back'
  return byCode[e.keyCode] ?? null
}

declare global {
  interface Window {
    tizen?: {
      tvinputdevice: { registerKey(name: string): void }
      application: { getCurrentApplication(): { hide(): void; exit(): void } }
    }
  }
}

export function registerTvKeys(): void {
  for (const name of ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaFastForward', 'MediaRewind', 'MediaStop', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
    try {
      window.tizen?.tvinputdevice.registerKey(name)
    } catch {
      continue
    }
  }
}
