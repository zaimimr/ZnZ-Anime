const key = (anilistId: number, ep: number) => `znz.resume.${anilistId}.${ep}`

export function getResume(anilistId: number, ep: number): number {
  return Number(localStorage.getItem(key(anilistId, ep)) ?? 0)
}

export function setResume(anilistId: number, ep: number, seconds: number): void {
  localStorage.setItem(key(anilistId, ep), String(Math.floor(seconds)))
}

export function clearResume(anilistId: number, ep: number): void {
  localStorage.removeItem(key(anilistId, ep))
}

const serverKey = (anilistId: number) => `znz.server.${anilistId}`
const LAST_SERVER = 'znz.server.last'

export function getServer(anilistId: number): string | null {
  return localStorage.getItem(serverKey(anilistId)) ?? localStorage.getItem(LAST_SERVER)
}

export function setServer(anilistId: number, provider: string): void {
  localStorage.setItem(serverKey(anilistId), provider)
  localStorage.setItem(LAST_SERVER, provider)
}
