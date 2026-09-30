import { getToken, validToken } from '../auth/tokens'
import { hosts } from '../hosts'
import { request } from '../http'

export async function gql<T>(query: string, variables: Record<string, unknown> = {}, auth = getToken('anilist') !== null): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' }
  if (auth) headers.authorization = `Bearer ${await validToken('anilist')}`
  const res = await request(hosts.anilist, { method: 'POST', headers, body: JSON.stringify({ query, variables }) }, { provider: auth ? 'anilist' : undefined })
  const json = (await res.json()) as { data: T; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data
}
