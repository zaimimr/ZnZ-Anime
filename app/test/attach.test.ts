import { beforeEach, describe, expect, it, vi } from 'vitest'

const { instances, FakeHls } = vi.hoisted(() => {
  const instances: InstanceType<typeof FakeHls>[] = []
  class FakeHls {
    static Events = { ERROR: 'hlsError' }
    static ErrorTypes = { MEDIA_ERROR: 'mediaError', NETWORK_ERROR: 'networkError' }
    static ErrorDetails = { MANIFEST_LOAD_ERROR: 'manifestLoadError', LEVEL_LOAD_ERROR: 'levelLoadError' }
    static isSupported = () => true
    handlers: Record<string, (event: string, data: unknown) => void> = {}
    recoverMediaError = vi.fn()
    destroy = vi.fn()
    loadSource = vi.fn()
    attachMedia = vi.fn()
    constructor() { instances.push(this) }
    on(event: string, fn: (event: string, data: unknown) => void) { this.handlers[event] = fn }
    fail(data: unknown) { this.handlers.hlsError('hlsError', data) }
  }
  return { instances, FakeHls }
})
vi.mock('hls.js', () => ({ default: FakeHls }))

import { attachStream } from '../src/player/attach'

beforeEach(() => { instances.length = 0 })

describe('attachStream', () => {
  it('uses the TV player for HLS on Tizen', () => {
    const el = document.createElement('video')
    el.canPlayType = () => 'maybe'
    window.tizen = {} as NonNullable<typeof window.tizen>
    attachStream(el, 'https://x/a.m3u8', 'hls', vi.fn())
    delete window.tizen
    expect(instances).toHaveLength(0)
    expect(el.src).toBe('https://x/a.m3u8')
  })

  it('lets hls.js recover media errors 3 times before giving up', () => {
    const el = document.createElement('video')
    const onFatal = vi.fn()
    attachStream(el, 'https://x/a.m3u8', 'hls', onFatal)
    const hls = instances[0]
    for (let i = 0; i < 3; i++) hls.fail({ fatal: true, type: 'mediaError' })
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(3)
    expect(onFatal).not.toHaveBeenCalled()
    hls.fail({ fatal: true, type: 'mediaError' })
    expect(onFatal).toHaveBeenCalledWith(false)
  })

  it('reports blocked providers on manifest load errors and ignores non-fatal ones', () => {
    const el = document.createElement('video')
    const onFatal = vi.fn()
    attachStream(el, 'https://x/a.m3u8', 'hls', onFatal)
    instances[0].fail({ fatal: false, type: 'networkError' })
    instances[0].fail({ fatal: true, type: 'networkError', details: 'manifestLoadError' })
    expect(onFatal).toHaveBeenCalledTimes(1)
    expect(onFatal).toHaveBeenCalledWith(true)
  })

  it('does not use the element error handler for hls streams', () => {
    const el = document.createElement('video')
    attachStream(el, 'https://x/a.m3u8', 'hls', vi.fn())
    expect(el.onerror).toBeNull()
  })

  it('uses the element error handler for mp4 and cleans up', () => {
    const el = document.createElement('video')
    const onFatal = vi.fn()
    const detach = attachStream(el, 'https://x/a.mp4', 'mp4', onFatal)
    el.dispatchEvent(new Event('error'))
    expect(onFatal).toHaveBeenCalledWith(false)
    detach()
    expect(el.onerror).toBeNull()
  })

  it('destroys hls.js on cleanup', () => {
    const detach = attachStream(document.createElement('video'), 'https://x/a.m3u8', 'hls', vi.fn())
    detach()
    expect(instances[0].destroy).toHaveBeenCalled()
  })
})
