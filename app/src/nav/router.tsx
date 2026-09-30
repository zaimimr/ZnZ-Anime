import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Provider } from '../types'
import { keyAction } from './keys'

export type Route =
  | { name: 'home' }
  | { name: 'search' }
  | { name: 'details'; id: number }
  | { name: 'player'; id: number; ep: number }
  | { name: 'settings' }
  | { name: 'pair'; provider: Provider; next: 'home' | 'settings' }

interface RouterValue {
  route: Route
  push(route: Route): void
  replace(route: Route): void
  back(): void
  setBackHandler(fn: (() => boolean) | null): void
}

const RouterContext = createContext<RouterValue | null>(null)

export function RouterProvider({ initial, children }: { initial: Route; children: ReactNode }) {
  const [stack, setStack] = useState<Route[]>([initial])
  const backHandler = useRef<(() => boolean) | null>(null)
  const push = useCallback((route: Route) => setStack((s) => [...s, route]), [])
  const replace = useCallback((route: Route) => setStack((s) => [...s.slice(0, -1), route]), [])
  const back = useCallback(() => {
    if (backHandler.current?.()) return
    setStack((s) => {
      if (s.length > 1) return s.slice(0, -1)
      window.tizen?.application.getCurrentApplication().hide()
      return s
    })
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

  const value = useMemo(() => ({ route: stack[stack.length - 1], push, replace, back, setBackHandler }), [stack, push, replace, back, setBackHandler])
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext)
  if (!value) throw new Error('useRouter outside RouterProvider')
  return value
}
