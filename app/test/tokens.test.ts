import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getToken, setToken, validToken } from '../src/auth/tokens'
import { AuthError } from '../src/http'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('tokens', () => {
  it('stores and reads tokens per provider', () => {
    setToken('anilist', { accessToken: 'A', expiresAt: Date.now() + 1e9 })
    expect(getToken('anilist')?.accessToken).toBe('A')
    expect(getToken('mal')).toBeNull()
  })

  it('throws AuthError when no token exists', async () => {
    await expect(validToken('mal')).rejects.toBeInstanceOf(AuthError)
  })

  it('refreshes MAL tokens close to expiry through the worker', async () => {
    setToken('mal', { accessToken: 'old', refreshToken: 'R', expiresAt: Date.now() + 10_000 })
    const fetchMock = vi.fn(async () => Response.json({ accessToken: 'new', refreshToken: 'R2', expiresAt: Date.now() + 1e9 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await validToken('mal')).toBe('new')
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('https://auth.test/refresh/mal')
    expect(getToken('mal')?.refreshToken).toBe('R2')
  })

  it('clears MAL and throws AuthError when refresh fails', async () => {
    setToken('mal', { accessToken: 'old', refreshToken: 'R', expiresAt: Date.now() - 1 })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    await expect(validToken('mal')).rejects.toBeInstanceOf(AuthError)
    expect(getToken('mal')).toBeNull()
  })
})
