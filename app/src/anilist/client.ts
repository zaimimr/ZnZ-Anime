import { clearToken, getToken, validToken } from '../auth/tokens'
import { hosts } from '../hosts'
import { AuthError, HttpError, request } from '../http'

export async function gql<T>(query: string, variables: Record<string, unknown> = {}, auth = getToken('anilist') !== null): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' }
  if (auth) headers.authorization = `Bearer ${await validToken('anilist')}`
  const res = await request(hosts.anilist, { method: 'POST', headers, body: JSON.stringify({ query, variables }) }, { provider: auth ? 'anilist' : undefined }).catch((e: unknown) => {
    if (auth && e instanceof HttpError && e.body.includes('Invalid token')) {
      clearToken('anilist')
      throw new AuthError('anilist')
    }
    throw e
  })
  const json = (await res.json()) as { data: T; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data
}
