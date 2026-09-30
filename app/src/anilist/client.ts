import { expire, getToken, validToken } from '../auth/tokens'
import { hosts } from '../hosts'
import { AuthError, HttpError, request } from '../http'

export async function gql<T>(query: string, variables: Record<string, unknown> = {}, auth = getToken('anilist') !== null): Promise<T> {
  const mutation = query.trimStart().startsWith('mutation')
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' }
  if (auth) {
    try {
      headers.authorization = `Bearer ${await validToken('anilist')}`
    } catch (e) {
      if (mutation || !(e instanceof AuthError)) throw e
      return gql(query, variables, false)
    }
  }
  const res = await request(hosts.anilist, { method: 'POST', headers, body: JSON.stringify({ query, variables }) }, { provider: auth && mutation ? 'anilist' : undefined }).catch((e: unknown) => {
    const rejected = e instanceof AuthError || (e instanceof HttpError && (e.status === 401 || e.body.includes('Invalid token')))
    if (!auth || !rejected) throw e
    const error = expire('anilist')
    if (mutation) throw error
    return null
  })
  if (!res) return gql(query, variables, false)
  const json = (await res.json()) as { data: T; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data
}
