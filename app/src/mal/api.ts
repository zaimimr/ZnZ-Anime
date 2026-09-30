import { validToken } from '../auth/tokens'
import { hosts } from '../hosts'
import { request } from '../http'
import type { Change, ListEntry, Status } from '../types'

const toMal: Record<Status, string> = { watching: 'watching', completed: 'completed', paused: 'on_hold', dropped: 'dropped', planning: 'plan_to_watch' }

export function malStatus(status: Status): string {
  return toMal[status]
}

function fromMal(value: string): Status {
  return (Object.keys(toMal) as Status[]).find((s) => toMal[s] === value) ?? 'planning'
}

async function authHeaders(): Promise<Record<string, string>> {
  return { authorization: `Bearer ${await validToken('mal')}` }
}

export async function fetchMalList(): Promise<ListEntry[]> {
  const entries: ListEntry[] = []
  let url: string | undefined = `${hosts.mal}/v2/users/@me/animelist?fields=list_status&limit=1000&nsfw=true`
  while (url) {
    const res = await request(url, { headers: await authHeaders() }, { provider: 'mal' })
    const body = (await res.json()) as { data: { node: { id: number; title: string }; list_status: { status: string; num_episodes_watched: number; score: number } }[]; paging: { next?: string } }
    for (const item of body.data) {
      entries.push({ malId: item.node.id, title: item.node.title, status: fromMal(item.list_status.status), progress: item.list_status.num_episodes_watched, score: item.list_status.score })
    }
    url = body.paging.next?.replace('https://api.myanimelist.net', hosts.mal)
  }
  return entries
}

export async function saveMalEntry(change: Change): Promise<void> {
  await request(
    `${hosts.mal}/v2/anime/${change.malId}/my_list_status`,
    {
      method: 'PATCH',
      headers: { ...(await authHeaders()), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ status: malStatus(change.status), num_watched_episodes: String(change.progress), score: String(Math.round(change.score)) }).toString(),
    },
    { provider: 'mal' },
  )
}
