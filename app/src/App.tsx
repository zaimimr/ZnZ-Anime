import { useEffect } from 'react'
import { getToken } from './auth/tokens'
import { AuthError } from './http'
import { RouterProvider, useRouter } from './nav/router'
import { Pair } from './screens/Pair'
import { flushQueue } from './sync/writer'

function Screens() {
  const { route, replace } = useRouter()

  useEffect(() => {
    const onError = (e: PromiseRejectionEvent) => {
      if (e.reason instanceof AuthError) replace({ name: 'pair', provider: e.reason.provider, next: 'home' })
    }
    window.addEventListener('unhandledrejection', onError)
    return () => window.removeEventListener('unhandledrejection', onError)
  }, [replace])

  switch (route.name) {
    case 'pair':
      return <Pair key={route.provider} provider={route.provider} next={route.next} />
    default:
      return <div className="screen center">Coming next: {route.name}</div>
  }
}

export default function App() {
  useEffect(() => {
    void flushQueue()
  }, [])
  const initial = getToken('anilist') ? ({ name: 'home' } as const) : ({ name: 'pair', provider: 'anilist', next: 'home' } as const)
  return (
    <RouterProvider initial={initial}>
      <Screens />
    </RouterProvider>
  )
}
