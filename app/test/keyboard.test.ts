import { describe, expect, it } from 'vitest'
import { applyKey, keyboardRows } from '../src/screens/keyboard'

describe('on-screen keyboard', () => {
  it('has letters, digits and actions', () => {
    const keys = keyboardRows.flat()
    expect(keys).toContain('a')
    expect(keys).toContain('0')
    expect(keys).toEqual(expect.arrayContaining(['space', 'del', 'clear', "'", '.', '!', '-', ':']))
  })

  it('edits text', () => {
    expect(applyKey('fri', 'e')).toBe('frie')
    expect(applyKey('frie', 'del')).toBe('fri')
    expect(applyKey('', 'del')).toBe('')
    expect(applyKey('a', 'space')).toBe('a ')
    expect(applyKey('abc', 'clear')).toBe('')
    expect(applyKey('x'.repeat(60), 'y')).toBe('x'.repeat(60))
  })
})
