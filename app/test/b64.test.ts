import { describe, expect, it } from 'vitest'
import { b64urlDecode, b64urlEncode } from '../src/b64'

describe('b64url', () => {
  it('round trips URLs with unicode and has no padding or +/', () => {
    const url = 'https://x.test/a?b=c&d=フリーレン~'
    const encoded = b64urlEncode(url)
    expect(encoded).not.toMatch(/[+/=]/)
    expect(b64urlDecode(encoded)).toBe(url)
  })
})
