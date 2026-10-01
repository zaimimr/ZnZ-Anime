import { init } from '@noriginmedia/norigin-spatial-navigation'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RouterProvider } from '../src/nav/router'

init()

describe('RouterProvider', () => {
  it('asks before exiting on the first screen', () => {
    const exit = vi.fn()
    window.tizen = { tvinputdevice: { registerKey: () => undefined }, application: { getCurrentApplication: () => ({ hide: vi.fn(), exit }) } }
    render(<RouterProvider initial={{ name: 'home' }}><p>home</p></RouterProvider>)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByText('Exit ZnZ Anime?')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('Exit ZnZ Anime?')).toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByText('Exit'))
    expect(exit).toHaveBeenCalled()
    window.tizen = undefined
  })
})
