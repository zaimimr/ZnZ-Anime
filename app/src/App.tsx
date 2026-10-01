import { FocusContext, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { lazy, type ReactNode, Suspense, useEffect, useState } from 'react'
import { ActiveContext, type Route, RouterProvider, useRouter } from './nav/router'
import { isOnboarded } from './onboarding'
import { DetailsScreen } from './screens/Details'
import { Home } from './screens/Home'
import { MyList } from './screens/MyList'
import { Pair, providerNames } from './screens/Pair'
import { Schedule } from './screens/Schedule'
import { Search } from './screens/Search'
import { SettingsScreen } from './screens/Settings'
import { Welcome } from './screens/Welcome'
import { flushQueue } from './sync/writer'
import type { Provider } from './types'

const PlayerScreen = lazy(() => import('./screens/Player').then((m) => ({ default: m.PlayerScreen })))

const keepAlive = new Set<Route['name']>(['home', 'search', 'list', 'schedule', 'details'])

const routeKey = (r: Route) => [r.name, 'id' in r ? r.id : '', 'ep' in r ? r.ep : '', 'provider' in r ? r.provider : ''].join('-')

function Layer({ index, active, children }: { index: number; active: boolean; children: ReactNode }) {
  const { ref, focusKey } = useFocusable<unknown, HTMLDivElement>({ focusKey: `layer-${index}`, focusable: active, saveLastFocusedChild: true, isFocusBoundary: true })
  useEffect(() => {
    if (active) setFocus(focusKey)
  }, [active, focusKey])
  return (
    <ActiveContext.Provider value={active}>
      <FocusContext.Provider value={focusKey}>
        <div ref={ref} className="layer" hidden={!active}>
          <Suspense fallback={null}>{children}</Suspense>
        </div>
      </FocusContext.Provider>
    </ActiveContext.Provider>
  )
}

function Screens() {
  const { stack } = useRouter()
  const top = stack.length - 1
  return stack.map((route, i) =>
    i === top || (keepAlive.has(route.name) && !stack.slice(i + 1).some((r) => r.name === route.name)) ? (
      <Layer key={`${i}-${routeKey(route)}`} index={i} active={i === top}>
        <Screen route={route} />
      </Layer>
    ) : null,
  )
}

function Screen({ route }: { route: Route }) {
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
  useEffect(() => {
    if (!splash) return
    const block = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', block, true)
    return () => window.removeEventListener('keydown', block, true)
  }, [splash])
  return (
    <RouterProvider initial={isOnboarded() ? { name: 'home' } : { name: 'welcome' }}>
      <Screens />
      <Toast />
      {splash && <Splash />}
    </RouterProvider>
  )
}
