import { clearToken, validToken } from '../auth/tokens'
import { hosts } from '../hosts'
import { AuthError, request } from '../http'
import type { Change, ListEntry, Status } from '../types'

const toMal: Record<Status, string> = { watching: 'watching', completed: 'completed', paused: 'on_hold', dropped: 'dropped', planning: 'plan_to_watch' }

export function malStatus(status: Status): string {
  return toMal[status]
}

function fromMal(value: string): Status {
  return (Object.keys(toMal) as Status[]).find((s) => toMal[s] === value) ?? 'planning'
}

async function malRequest(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await request(url, { ...init, headers: { ...(init.headers as Record<string, string>), ...(await authHeaders()) } }, { provider: 'mal' })
  } catch (e) {
    if (e instanceof AuthError) clearToken('mal')
    throw e
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  return { authorization: `Bearer ${await validToken('mal')}` }
}

export async function fetchMalList(): Promise<ListEntry[]> {
  const entries: ListEntry[] = []
  let url: string | undefined = `${hosts.mal}/v2/users/@me/animelist?fields=list_status&limit=1000&nsfw=true`
  while (url) {
    const res = await malRequest(url)
    const body = (await res.json()) as { data: { node: { id: number; title: string }; list_status: { status: string; num_episodes_watched: number; score: number } }[]; paging: { next?: string } }
    for (const item of body.data) {
      entries.push({ malId: item.node.id, title: item.node.title, status: fromMal(item.list_status.status), progress: item.list_status.num_episodes_watched, score: item.list_status.score })
    }
    url = body.paging.next?.replace('https://api.myanimelist.net', hosts.mal)
  }
  return entries
}

export async function malProgress(malId: number): Promise<number> {
  const res = await malRequest(`${hosts.mal}/v2/anime/${malId}?fields=my_list_status`)
  const body = (await res.json()) as { my_list_status?: { num_episodes_watched: number } }
  return body.my_list_status?.num_episodes_watched ?? 0
}

export async function deleteMalEntry(malId: number): Promise<void> {
  await malRequest(`${hosts.mal}/v2/anime/${malId}/my_list_status`, { method: 'DELETE' })
}

export async function saveMalEntry(change: Change): Promise<void> {
  await malRequest(`${hosts.mal}/v2/anime/${change.malId}/my_list_status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ status: malStatus(change.status), num_watched_episodes: String(change.progress), score: String(Math.round(change.score)) }).toString(),
  })
}
