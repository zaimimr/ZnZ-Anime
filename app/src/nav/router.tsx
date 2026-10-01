import { createContext, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Provider } from '../types'
import { ExitConfirm } from '../ui/ExitConfirm'
import { keyAction } from './keys'

export type Route =
  | { name: 'home' }
  | { name: 'search' }
  | { name: 'list' }
  | { name: 'schedule' }
  | { name: 'details'; id: number }
  | { name: 'player'; id: number; ep: number }
  | { name: 'settings' }
  | { name: 'pair'; provider: Provider; next: 'home' | 'settings' }
  | { name: 'welcome' }

interface RouterValue {
  route: Route
  stack: Route[]
  push(route: Route): void
  replace(route: Route): void
  reset(route: Route): void
  back(): void
  setBackHandler(fn: (() => boolean) | null): void
}

const RouterContext = createContext<RouterValue | null>(null)

export const ActiveContext = createContext(true)

export function useActive(): boolean {
  return useContext(ActiveContext)
}

export function useOnResume(fn: () => void): void {
  const active = useActive()
  const seen = useRef(active)
  const latest = useRef(fn)
  useLayoutEffect(() => {
    latest.current = fn
  })
  useEffect(() => {
    if (active && !seen.current) latest.current()
    seen.current = active
  }, [active])
}

export function RouterProvider({ initial, children }: { initial: Route; children: ReactNode }) {
  const [stack, setStack] = useState<Route[]>([initial])
  const [exiting, setExiting] = useState(false)
  const depth = useRef(1)
  useLayoutEffect(() => {
    depth.current = stack.length
  }, [stack])
  const backHandler = useRef<(() => boolean) | null>(null)
  const push = useCallback((route: Route) => setStack((s) => [...s, route]), [])
  const replace = useCallback((route: Route) => setStack((s) => [...s.slice(0, -1), route]), [])
  const reset = useCallback((route: Route) => setStack([route]), [])
  const back = useCallback(() => {
    if (backHandler.current?.()) return
    if (depth.current > 1) setStack((s) => s.slice(0, -1))
    else setExiting((e) => !e)
  }, [])
  const setBackHandler = useCallback((fn: (() => boolean) | null) => { backHandler.current = fn }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (keyAction(e) !== 'back') return
      if (e.key === 'Backspace' && (e.target as HTMLElement).tagName === 'INPUT') return
      e.preventDefault()
      back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [back])

  const value = useMemo(() => ({ route: stack[stack.length - 1], stack, push, replace, reset, back, setBackHandler }), [stack, push, replace, reset, back, setBackHandler])
  return (
    <RouterContext.Provider value={value}>
      {children}
      {exiting && <ExitConfirm onStay={() => setExiting(false)} />}
    </RouterContext.Provider>
  )
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext)
  if (!value) throw new Error('useRouter outside RouterProvider')
  return value
}
