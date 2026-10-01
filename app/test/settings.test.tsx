import { init } from '@noriginmedia/norigin-spatial-navigation'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/anilist/api', () => ({ viewer: vi.fn(async () => ({ id: 1, name: 'z' })) }))
vi.mock('../src/ui/Focusable', () => ({
  Focusable: ({ onEnter, onFocus, onBlur, className, children }: { onEnter?: () => void; onFocus?: () => void; onBlur?: () => void; className?: string; children: ReactNode }) => <div className={className} onClick={onEnter} onFocus={onFocus} onBlur={onBlur}>{children}</div>,
}))
vi.mock('../src/mal/api', () => ({ malViewer: vi.fn(async () => ({ name: 'm' })) }))

import { getToken, setToken } from '../src/auth/tokens'
import { RouterProvider } from '../src/nav/router'
import { SettingsScreen } from '../src/screens/Settings'
import { enqueue, readQueue } from '../src/sync/queue'

init()

const token = { accessToken: 'x', expiresAt: Date.now() + 1e9 }

beforeEach(() => {
  localStorage.clear()
  setToken('anilist', token)
  setToken('mal', token)
})

const show = () => render(<RouterProvider initial={{ name: 'settings' }}><SettingsScreen /></RouterProvider>)

describe('SettingsScreen', () => {
  it('unlinking forgets that site and the merge', async () => {
    enqueue('anilist', { anilistId: 1, status: 'watching', progress: 1, score: 0 })
    enqueue('mal', { malId: 1, status: 'watching', progress: 1, score: 0 })
    localStorage.setItem('znz.merged', '1')
    localStorage.setItem('znz.unmatched', '[]')
    show()
    fireEvent.click(screen.getAllByText('Unlink')[1])
    fireEvent.click(screen.getByText('Press OK to unlink'))
    expect(getToken('mal')).toBeNull()
    expect(getToken('anilist')).not.toBeNull()
    expect(readQueue().map((i) => i.target)).toEqual(['anilist'])
    expect(localStorage.getItem('znz.merged')).toBeNull()
    expect(localStorage.getItem('znz.unmatched')).toBeNull()
  })

  it('disarms unlink when focus leaves the row', async () => {
    show()
    fireEvent.click(screen.getAllByText('Unlink')[0])
    expect(screen.getByText('Press OK to unlink')).toBeTruthy()
    fireEvent.blur(screen.getByText('Press OK to unlink').closest('.setting')!)
    expect(screen.queryByText('Press OK to unlink')).toBeNull()
    expect(getToken('anilist')).not.toBeNull()
  })

  it('disarms reset when focus leaves the row', async () => {
    show()
    fireEvent.focus(screen.getByText('About').closest('.rail-item')!)
    fireEvent.click(screen.getByText('Reset'))
    expect(screen.getByText('Press OK to erase')).toBeTruthy()
    fireEvent.blur(screen.getByText('Press OK to erase').closest('.setting')!)
    expect(screen.getByText('Reset')).toBeTruthy()
  })
})
