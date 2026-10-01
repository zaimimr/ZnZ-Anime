import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { attaches } = vi.hoisted(() => ({ attaches: [] as { url: string; fail: (blocked: boolean) => void }[] }))

vi.mock('../src/anilist/api', () => ({ details: vi.fn() }))
vi.mock('../src/library', () => ({ libraryEntry: vi.fn(async () => null) }))
vi.mock('../src/sync/writer', () => ({ saveEverywhere: vi.fn(async () => undefined) }))
vi.mock('../src/player/proxy', () => ({ playableUrl: (url: string) => url, streamWorks: vi.fn(async () => true) }))
vi.mock('../src/player/attach', () => ({
  attachStream: (_el: HTMLVideoElement, url: string, _format: string, fail: (blocked: boolean) => void) => {
    attaches.push({ url, fail })
    return () => undefined
  },
}))
vi.mock('../src/sources/registry', () => ({ resolveFirst: vi.fn(), streamsWithFallback: vi.fn() }))

import { details } from '../src/anilist/api'
import { RouterProvider } from '../src/nav/router'
import { PlayerScreen } from '../src/screens/Player'
import { resolveFirst, streamsWithFallback } from '../src/sources/registry'
import type { SourceAdapter, Stream } from '../src/sources/types'

const stream = (provider: string): Stream => ({ provider, url: `https://${provider}/a.m3u8`, format: 'hls', subtitles: [] })
const adapter = (id: string) => ({ id, stream: vi.fn(async () => []) }) as unknown as SourceAdapter
const info = { id: 1, title: 'Frieren', titles: ['Frieren'], cover: '', description: '', status: 'FINISHED', progress: 0, score: 0, related: [], recommended: [], episodes: 28 }

HTMLMediaElement.prototype.play = vi.fn(async () => undefined)
HTMLMediaElement.prototype.pause = vi.fn()
Object.defineProperty(HTMLMediaElement.prototype, 'textTracks', { configurable: true, get: () => Object.assign(new EventTarget(), { length: 0 }) })

beforeEach(() => {
  localStorage.clear()
  attaches.length = 0
  vi.mocked(details).mockResolvedValue(info)
  vi.mocked(resolveFirst).mockReset()
  vi.mocked(streamsWithFallback).mockResolvedValue({ streams: [stream('alpha'), stream('beta')], lang: 'sub' })
})

function video(): HTMLVideoElement {
  return document.querySelector('video')!
}

function playAt(seconds: number) {
  const el = video()
  Object.defineProperty(el, 'currentTime', { configurable: true, value: seconds, writable: true })
  Object.defineProperty(el, 'duration', { configurable: true, value: 1440 })
  fireEvent.playing(el)
  fireEvent.timeUpdate(el)
}

async function stall() {
  const count = attaches.length
  await act(async () => attaches.at(-1)!.fail(false))
  await waitFor(() => expect(attaches.length).toBeGreaterThan(count))
}

const urls = () => attaches.map((a) => a.url)

async function start() {
  vi.mocked(resolveFirst).mockResolvedValueOnce({ adapter: adapter('one'), show: { source: 'one', id: '1' }, episodes: [{ number: 1 }] }).mockResolvedValue(null)
  render(<RouterProvider initial={{ name: 'player', id: 1, ep: 1 }}><PlayerScreen id={1} ep={1} /></RouterProvider>)
  await waitFor(() => expect(attaches).toHaveLength(1))
}

describe('PlayerScreen stall recovery', () => {
  it('reconnects once, then switches server when the same spot stalls again', async () => {
    await start()
    playAt(118)
    await stall()
    playAt(118)
    await stall()
    expect(urls()).toEqual(['https://alpha/a.m3u8', 'https://alpha/a.m3u8', 'https://beta/a.m3u8'])
  })

  it('stops with an error instead of looping when every server stalls', async () => {
    await start()
    for (let i = 0; i < 4; i++) {
      playAt(118)
      if (i < 3) await stall()
      else await act(async () => attaches.at(-1)!.fail(false))
    }
    expect(await screen.findByText('No source available.')).toBeTruthy()
    expect(urls()).toEqual(['https://alpha/a.m3u8', 'https://alpha/a.m3u8', 'https://beta/a.m3u8', 'https://beta/a.m3u8'])
    expect(resolveFirst).toHaveBeenLastCalledWith(expect.anything(), ['one'])
  })

  it('reconnects again on a later stall after playback moved on', async () => {
    await start()
    playAt(118)
    await stall()
    playAt(200)
    await stall()
    expect(urls()).toEqual(['https://alpha/a.m3u8', 'https://alpha/a.m3u8', 'https://alpha/a.m3u8'])
  })

  it('switches server right away when the provider is blocked', async () => {
    await start()
    await act(async () => attaches[0].fail(true))
    await waitFor(() => expect(urls()).toEqual(['https://alpha/a.m3u8', 'https://beta/a.m3u8']))
  })
})
