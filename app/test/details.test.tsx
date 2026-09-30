import { init } from '@noriginmedia/norigin-spatial-navigation'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/anilist/api', () => ({ details: vi.fn() }))
vi.mock('../src/sources/registry', () => ({ resolveFirst: vi.fn(async () => null) }))

import { details } from '../src/anilist/api'
import { HttpError } from '../src/http'
import { RouterProvider } from '../src/nav/router'
import { DetailsScreen } from '../src/screens/Details'

const info = { id: 1, title: 'Frieren', titles: ['Frieren'], cover: '', description: '', status: 'FINISHED', progress: 0, score: 0, related: [] }

init()

beforeEach(() => vi.mocked(details).mockReset())

describe('DetailsScreen', () => {
  it('shows an error with Retry instead of loading forever', async () => {
    vi.mocked(details).mockRejectedValueOnce(new HttpError(503, 'x')).mockResolvedValueOnce(info)
    render(<RouterProvider initial={{ name: 'details', id: 1 }}><DetailsScreen id={1} /></RouterProvider>)
    expect(await screen.findByText('Could not load this anime.')).toBeTruthy()
    fireEvent.click(screen.getByText('Retry'))
    expect(await screen.findByText('Frieren')).toBeTruthy()
  })

  it('plays the next episode and shows watched count', async () => {
    vi.mocked(details).mockResolvedValueOnce({ ...info, episodes: 28, progress: 3, listStatus: 'watching' })
    render(<RouterProvider initial={{ name: 'details', id: 1 }}><DetailsScreen id={1} /></RouterProvider>)
    expect(await screen.findByText(/Play episode 4/)).toBeTruthy()
    expect(screen.getByText(/Watched 3 of 28/)).toBeTruthy()
  })
})
