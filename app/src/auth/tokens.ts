import { hosts } from '../hosts'
import { AuthError, request } from '../http'
import type { Provider, Tokens } from '../types'

const key = (provider: Provider) => `znz.tokens.${provider}`

export function getToken(provider: Provider): Tokens | null {
  try {
    return JSON.parse(localStorage.getItem(key(provider)) ?? 'null')
  } catch {
    return null
  }
}

export function setToken(provider: Provider, tokens: Tokens): void {
  localStorage.setItem(key(provider), JSON.stringify(tokens))
}

export function clearToken(provider: Provider): void {
  localStorage.removeItem(key(provider))
}

export async function validToken(provider: Provider): Promise<string> {
  const tokens = getToken(provider)
  if (!tokens) throw new AuthError(provider)
  if (tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken
  if (provider === 'anilist' || !tokens.refreshToken) {
    clearToken(provider)
    throw new AuthError(provider)
  }
  try {
    const res = await request(`${hosts.auth}/refresh/mal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    })
    const fresh = (await res.json()) as Tokens
    setToken('mal', fresh)
    return fresh.accessToken
  } catch {
    clearToken('mal')
    throw new AuthError('mal')
  }
}
