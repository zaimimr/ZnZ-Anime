import { init } from '@noriginmedia/norigin-spatial-navigation'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const opened = vi.fn()
const target = { id: 1 }

vi.mock('../src/onboarding', () => ({ isOnboarded: () => true }))
vi.mock('../src/sync/writer', () => ({ flushQueue: async () => undefined }))
vi.mock('../src/screens/Home', async () => {
  const { Focusable } = await import('../src/ui/Focusable')
  const { useRouter } = await import('../src/nav/router')
  return {
    Home: () => {
      const { push } = useRouter()
      return <Focusable autoFocus onEnter={() => { opened(); push({ name: 'details', id: target.id }) }}>home</Focusable>
    },
  }
})
vi.mock('../src/screens/Details', async () => {
  const { Focusable } = await import('../src/ui/Focusable')
  const { useRouter } = await import('../src/nav/router')
  return {
    DetailsScreen: ({ id }: { id: number }) => {
      const { push } = useRouter()
      if (id === 1) return <p>loading</p>
      return <Focusable focusKey="status-btn" autoFocus onEnter={() => push({ name: 'details', id: id + 1 })}>details {id}</Focusable>
    },
  }
})

import App from '../src/App'

init()

const key = (keyCode: number, k: string) => act(async () => {
  fireEvent.keyDown(window, { keyCode, key: k })
  fireEvent.keyUp(window, { keyCode, key: k })
  await new Promise((r) => setTimeout(r, 50))
})

const start = async () => {
  render(<App />)
  await act(async () => { await new Promise((r) => setTimeout(r, 2100)) })
}

describe('App screen stack', () => {
  it('moves focus off the old screen as soon as a new one opens', async () => {
    opened.mockClear()
    target.id = 1
    await start()
    await key(13, 'Enter')
    expect(opened).toHaveBeenCalledTimes(1)
    expect(screen.getByText('loading')).toBeTruthy()
    await key(13, 'Enter')
    expect(opened).toHaveBeenCalledTimes(1)
  }, 10000)

  it('keeps an earlier Details screen working after a later one closes', async () => {
    target.id = 2
    await start()
    await key(13, 'Enter')
    expect(screen.getByText('details 2')).toBeTruthy()
    await key(13, 'Enter')
    expect(screen.getByText('details 3')).toBeTruthy()
    expect(screen.queryByText('details 2')).toBeNull()
    await key(27, 'Escape')
    expect(screen.getByText('details 2')).toBeTruthy()
    await key(13, 'Enter')
    expect(screen.getByText('details 3')).toBeTruthy()
  }, 10000)
})
