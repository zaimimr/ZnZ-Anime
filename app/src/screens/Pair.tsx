import { useEffect, useState } from 'react'
import { pollPair, startPair } from '../auth/pair'
import { setToken } from '../auth/tokens'
import { useRouter } from '../nav/router'
import type { Provider } from '../types'
import { Focusable } from '../ui/Focusable'
import { Qr } from '../ui/Qr'

const names: Record<Provider, string> = { anilist: 'AniList', mal: 'MyAnimeList' }

export function Pair({ provider, next }: { provider: Provider; next: 'home' | 'settings' }) {
  const { replace } = useRouter()
  const [pair, setPair] = useState<{ code: string; pairUrl: string } | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
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
          if (result === 'expired') return setError('Code expired.')
          if (result === 'pending') {
            timer = setTimeout(tick, 2000)
            return
          }
          setToken(provider, result)
          replace(provider === 'anilist' && next === 'home' ? { name: 'pair', provider: 'mal', next: 'settings' } : { name: next })
        }
        timer = setTimeout(tick, 2000)
      })
      .catch(() => alive && setError('Could not reach the login server.'))
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [provider, next, attempt, replace])

  return (
    <div className="screen center">
      <h1>Log in with {names[provider]}</h1>
      {pair && <Qr value={pair.pairUrl} />}
      {pair && <p className="muted">Scan with your phone, or open {pair.pairUrl}</p>}
      {pair && <p style={{ fontSize: 64, letterSpacing: 12, margin: 0 }}>{pair.code}</p>}
      {error && <p>{error}</p>}
      <div style={{ display: 'flex', gap: 24 }}>
        {error && <Focusable className="btn" autoFocus onEnter={() => setAttempt((a) => a + 1)}>Try again</Focusable>}
        {provider === 'mal' && <Focusable className="btn" autoFocus={!error} onEnter={() => replace({ name: 'home' })}>Skip for now</Focusable>}
      </div>
    </div>
  )
}
