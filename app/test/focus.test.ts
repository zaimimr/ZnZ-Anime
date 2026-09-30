import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@noriginmedia/norigin-spatial-navigation', () => ({
  ROOT_FOCUS_KEY: 'SN:ROOT',
  getCurrentFocusKey: vi.fn(),
  doesFocusableExist: vi.fn(),
  setFocus: vi.fn(),
}))

import { doesFocusableExist, getCurrentFocusKey, setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { recoverFocus } from '../src/nav/focus'

beforeEach(() => vi.mocked(setFocus).mockClear())

describe('recoverFocus', () => {
  it('leaves focus alone while the focused element still exists', () => {
    vi.mocked(getCurrentFocusKey).mockReturnValue('btn-1')
    vi.mocked(doesFocusableExist).mockReturnValue(true)
    expect(recoverFocus()).toBe(false)
    expect(setFocus).not.toHaveBeenCalled()
  })

  it('refocuses the screen when the focused element disappeared', () => {
    vi.mocked(getCurrentFocusKey).mockReturnValue('btn-gone')
    vi.mocked(doesFocusableExist).mockReturnValue(false)
    expect(recoverFocus()).toBe(true)
    expect(setFocus).toHaveBeenCalledWith('SN:ROOT')
  })

  it('refocuses when only the root is focused', () => {
    vi.mocked(getCurrentFocusKey).mockReturnValue('SN:ROOT')
    vi.mocked(doesFocusableExist).mockReturnValue(true)
    expect(recoverFocus()).toBe(true)
  })
})
