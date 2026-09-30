import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkServer, hosts, serverUrl } from '../src/hosts'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('server address', () => {
  it('uses the address from settings over the built-in one', () => {
    expect(hosts.auth).toBe('https://auth.test')
    localStorage.setItem('znz.settings', JSON.stringify({ server: 'https://mine.workers.dev' }))
    expect(hosts.auth).toBe('https://mine.workers.dev')
  })

  it('adds https and drops trailing slashes', () => {
    expect(serverUrl(' znz-auth.me.workers.dev/ ')).toBe('https://znz-auth.me.workers.dev')
    expect(serverUrl('http://10.0.0.2:8787')).toBe('http://10.0.0.2:8787')
  })

  it('accepts only a ZnZ Anime server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'missing u' }, { status: 400 })))
    expect(await checkServer('https://a')).toBe(true)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 404 })))
    expect(await checkServer('https://b')).toBe(false)
  })
})
