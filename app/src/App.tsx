import { useEffect, useState } from 'react'
import { RouterProvider, useRouter } from './nav/router'
import { isOnboarded } from './onboarding'
import { DetailsScreen } from './screens/Details'
import { Home } from './screens/Home'
import { MyList } from './screens/MyList'
import { Pair, providerNames } from './screens/Pair'
import { PlayerScreen } from './screens/Player'
import { Schedule } from './screens/Schedule'
import { Search } from './screens/Search'
import { SettingsScreen } from './screens/Settings'
import { Welcome } from './screens/Welcome'
import { flushQueue } from './sync/writer'
import type { Provider } from './types'

function Screens() {
  const { route } = useRouter()
  switch (route.name) {
    case 'welcome':
      return <Welcome />
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

function Toast() {
  const [message, setMessage] = useState('')
  useEffect(() => {
    const onExpired = (e: Event) => setMessage(`Your ${providerNames[(e as CustomEvent<Provider>).detail]} login expired. Link it again in Settings.`)
    window.addEventListener('znz:expired', onExpired)
    return () => window.removeEventListener('znz:expired', onExpired)
  }, [])
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 6000)
    return () => clearTimeout(timer)
  }, [message])
  return message ? <div className="toast">{message}</div> : null
}

export default function App() {
  const [splash, setSplash] = useState(true)
  useEffect(() => {
    void flushQueue()
    const timer = setTimeout(() => setSplash(false), 2000)
    return () => clearTimeout(timer)
  }, [])
  return (
    <RouterProvider initial={isOnboarded() ? { name: 'home' } : { name: 'welcome' }}>
      <Screens />
      <Toast />
      {splash && <Splash />}
    </RouterProvider>
  )
}
