import { useEffect, useState } from 'react'
import { getToken } from './auth/tokens'
import { AuthError } from './http'
import { RouterProvider, useRouter } from './nav/router'
import { DetailsScreen } from './screens/Details'
import { Home } from './screens/Home'
import { MyList } from './screens/MyList'
import { Pair } from './screens/Pair'
import { PlayerScreen } from './screens/Player'
import { Schedule } from './screens/Schedule'
import { Search } from './screens/Search'
import { SettingsScreen } from './screens/Settings'
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
    case 'home':
      return <Home />
    case 'search':
      return <Search />
    case 'list':
      return <MyList />
    case 'schedule':
      return <Schedule />
    case 'details':
      return <DetailsScreen key={route.id} id={route.id} />
    case 'player':
      return <PlayerScreen key={`${route.id}-${route.ep}`} id={route.id} ep={route.ep} />
    case 'settings':
      return <SettingsScreen />
  }
}

function Splash() {
  return (
    <div className="splash">
      <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" />
      <div className="brand">ZnZ<span>Anime</span></div>
    </div>
  )
}

export default function App() {
  const [splash, setSplash] = useState(true)
  useEffect(() => {
    void flushQueue()
    const timer = setTimeout(() => setSplash(false), 2000)
    return () => clearTimeout(timer)
  }, [])
  const initial = getToken('anilist') ? ({ name: 'home' } as const) : ({ name: 'pair', provider: 'anilist', next: 'home' } as const)
  return (
    <RouterProvider initial={initial}>
      <Screens />
      {splash && <Splash />}
    </RouterProvider>
  )
}
