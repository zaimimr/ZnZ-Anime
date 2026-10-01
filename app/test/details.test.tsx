import { init } from '@noriginmedia/norigin-spatial-navigation'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/anilist/api', () => ({ details: vi.fn() }))
vi.mock('../src/sources/registry', () => ({ resolveFirst: vi.fn(async () => ({ adapter: { id: 'test' }, show: { source: 'test', id: '1' }, episodes: Array.from({ length: 28 }, (_, i) => ({ number: i + 1 })) })) }))

import { details } from '../src/anilist/api'
import { setToken } from '../src/auth/tokens'
import { resolveFirst } from '../src/sources/registry'
import { HttpError } from '../src/http'
import { RouterProvider } from '../src/nav/router'
import { DetailsScreen } from '../src/screens/Details'

const info = { id: 1, title: 'Frieren', titles: ['Frieren'], cover: '', description: '', status: 'FINISHED', progress: 0, score: 0, related: [], recommended: [] }

init()

beforeEach(() => {
  localStorage.clear()
  vi.mocked(details).mockReset()
})

describe('DetailsScreen', () => {
  it('shows an error with Retry instead of loading forever', async () => {
    vi.mocked(details).mockRejectedValueOnce(new HttpError(503, 'x')).mockResolvedValueOnce(info)
    render(<RouterProvider initial={{ name: 'details', id: 1 }}><DetailsScreen id={1} /></RouterProvider>)
    expect(await screen.findByText('Could not load this anime.')).toBeTruthy()
    fireEvent.click(screen.getByText('Retry'))
    expect(await screen.findByText('Frieren')).toBeTruthy()
  })

  it('plays the next episode and shows watched count', async () => {
    setToken('anilist', { accessToken: 'A', expiresAt: Date.now() + 1e9 })
    vi.mocked(details).mockResolvedValueOnce({ ...info, episodes: 28, progress: 3, listStatus: 'watching' })
    render(<RouterProvider initial={{ name: 'details', id: 1 }}><DetailsScreen id={1} /></RouterProvider>)
    expect(await screen.findByText(/Play episode 4/)).toBeTruthy()
    expect(screen.getByText(/Watched 3 of 28/)).toBeTruthy()
  })

  it('reads progress from the list on this TV when no account is linked', async () => {
    localStorage.setItem('znz.local.list', JSON.stringify([{ anilistId: 1, status: 'watching', progress: 5, score: 0, updatedAt: 1 }]))
    vi.mocked(details).mockResolvedValueOnce({ ...info, episodes: 28 })
    render(<RouterProvider initial={{ name: 'details', id: 1 }}><DetailsScreen id={1} /></RouterProvider>)
    expect(await screen.findByText(/Play episode 6/)).toBeTruthy()
    expect(screen.getByText(/Watching · Watched 5 of 28/)).toBeTruthy()
  })

  it('hides Play when no stream is found', async () => {
    vi.mocked(resolveFirst).mockResolvedValueOnce(null)
    vi.mocked(details).mockResolvedValueOnce(info)
    render(<RouterProvider initial={{ name: 'details', id: 1 }}><DetailsScreen id={1} /></RouterProvider>)
    expect(await screen.findByText('No streams found for this show right now.')).toBeTruthy()
    expect(screen.queryByText(/Play episode/)).toBeNull()
  })

  it('offers Retry when every source fails', async () => {
    vi.mocked(resolveFirst).mockRejectedValueOnce(new Error('down'))
    vi.mocked(details).mockResolvedValueOnce(info)
    render(<RouterProvider initial={{ name: 'details', id: 1 }}><DetailsScreen id={1} /></RouterProvider>)
    expect(await screen.findByText('No streams found for this show right now.')).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
  })

  it('says not aired yet without Retry', async () => {
    vi.mocked(resolveFirst).mockResolvedValueOnce(null)
    vi.mocked(details).mockResolvedValueOnce({ ...info, status: 'NOT_YET_RELEASED' })
    render(<RouterProvider initial={{ name: 'details', id: 1 }}><DetailsScreen id={1} /></RouterProvider>)
    expect((await screen.findAllByText('Not aired yet')).length).toBe(2)
    expect(screen.queryByText('Retry')).toBeNull()
  })

  it('renders only a window of a long episode list', async () => {
    vi.mocked(resolveFirst).mockResolvedValueOnce({ adapter: { id: 'test' }, show: { source: 'test', id: '1' }, episodes: Array.from({ length: 1184 }, (_, i) => ({ number: i + 1 })) } as never)
    vi.mocked(details).mockResolvedValueOnce({ ...info, episodes: 1184 })
    const { container } = render(<RouterProvider initial={{ name: 'details', id: 1 }}><DetailsScreen id={1} /></RouterProvider>)
    expect(await screen.findByText(/Play episode 1/)).toBeTruthy()
    await screen.findByText('E1')
    expect(container.querySelectorAll('.episode').length).toBeLessThanOrEqual(61)
  })
})
