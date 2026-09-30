import { describe, expect, it } from 'vitest'
import { keyAction } from '../src/nav/keys'

describe('keyAction', () => {
  it.each([
    [10009, '', 'back'],
    [0, 'Escape', 'back'],
    [0, 'Backspace', 'back'],
    [10252, '', 'playpause'],
    [415, '', 'play'],
    [19, '', 'pause'],
    [417, '', 'ff'],
    [412, '', 'rw'],
    [413, '', 'stop'],
    [37, 'ArrowLeft', null],
  ])('keyCode %i key %s maps to %s', (keyCode, key, expected) => {
    expect(keyAction({ keyCode: keyCode as number, key: key as string })).toBe(expected)
  })
})
