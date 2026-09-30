import { useEffect, useState } from 'react'
import { pollPair, startPair } from '../auth/pair'
import { setToken } from '../auth/tokens'
import { hosts } from '../hosts'
import { invalidateLibrary } from '../library'
import { useRouter } from '../nav/router'
import { finishOnboarding } from '../onboarding'
import type { Provider } from '../types'
import { Focusable } from '../ui/Focusable'
import { Qr } from '../ui/Qr'

export const providerNames: Record<Provider, string> = { anilist: 'AniList', mal: 'MyAnimeList' }

export function Pair({ provider, next }: { provider: Provider; next: 'home' | 'settings' }) {
  const { back, reset } = useRouter()
  const [pair, setPair] = useState<{ code: string; pairUrl: string } | null>(null)
  const [error, setError] = useState(hosts.auth ? '' : 'Login is not set up in this build of the app.')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!hosts.auth) return
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    setError('')
    setPair(null)
    startPair(provider)
      .then((p) => {
        if (!alive) return
        setPair(p)
        const tick = async () => {
          const result = await pollPair(p.code).catch(() => 'pending' as const)
          if (!alive) return
          if (result === 'expired') return setError('The code expired.')
          if (result === 'pending') {
            timer = setTimeout(tick, 2000)
            return
          }
          setToken(provider, result)
          invalidateLibrary()
          finishOnboarding()
          if (next === 'home') reset({ name: 'home' })
          else back()
        }
        timer = setTimeout(tick, 2000)
      })
      .catch(() => alive && setError('Could not reach the login server. Check the connection.'))
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [provider, next, attempt, reset, back])

  return (
    <div className="screen pair">
      <div className="pair-card">
        <div className="pair-text">
          <h1>Log in with {providerNames[provider]}</h1>
          <ol>
            <li>Scan the code with your phone camera</li>
            <li>Log in to {providerNames[provider]} and allow access</li>
            <li>This screen moves on by itself</li>
          </ol>
          {pair && (
            <>
              <p className="muted">No camera? Open this on any device</p>
              <p className="pair-url">{pair.pairUrl.replace(/^https?:\/\//, '')}</p>
            </>
          )}
          {!pair && !error && <p className="muted">Getting a code...</p>}
          {error && <p className="pair-error">{error}</p>}
          <div className="pair-actions">
            {error && hosts.auth && <Focusable className="btn active" autoFocus onEnter={() => setAttempt((a) => a + 1)}>Try again</Focusable>}
            <Focusable className="btn" autoFocus={!error || !hosts.auth} onEnter={back}>Cancel</Focusable>
          </div>
        </div>
        <div className="pair-qr">{pair ? <Qr value={pair.pairUrl} /> : <div className="qr-blank" />}</div>
      </div>
    </div>
  )
}
