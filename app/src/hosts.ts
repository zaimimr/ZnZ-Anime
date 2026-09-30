import { getSettings } from './settings'

const dev = import.meta.env.MODE === 'development'
const builtIn = (import.meta.env.VITE_AUTH_URL as string | undefined) ?? ''

export const hosts = {
  anilist: 'https://graphql.anilist.co',
  mal: dev ? '/x/mal' : 'https://api.myanimelist.net',
  miruro: dev ? '/x/miruro' : 'https://www.miruro.to',
  aniskip: 'https://api.aniskip.com',
  get auth(): string {
    return getSettings().server || builtIn
  },
}

export function serverUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
}

export async function checkServer(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/proxy`)
    const body = (await res.json()) as { error?: string }
    return res.status === 400 && body.error === 'missing u'
  } catch {
    return false
  }
}
