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
