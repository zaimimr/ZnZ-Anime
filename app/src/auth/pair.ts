import { hosts } from '../hosts'
import { request } from '../http'
import type { Provider, Tokens } from '../types'

export async function startPair(provider: Provider): Promise<{ code: string; pairUrl: string }> {
  const res = await request(`${hosts.auth}/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider }),
  })
  return res.json()
}

export async function pollPair(code: string): Promise<Tokens | 'pending' | 'expired'> {
  const res = await fetch(`${hosts.auth}/pair/${code}`)
  if (res.status === 202) return 'pending'
  if (!res.ok) return 'expired'
  const body = (await res.json()) as { tokens: Tokens }
  return body.tokens
}
