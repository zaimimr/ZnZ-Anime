import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react'
import { useActive } from '../nav/router'

export function Focusable({ onEnter, onFocus, onBlur, focusKey, className = '', children, autoFocus }: { onEnter?: () => void; onFocus?: () => void; onBlur?: () => void; focusKey?: string; className?: string; children: ReactNode; autoFocus?: boolean }) {
  const { ref, focused, focusSelf } = useFocusable<unknown, HTMLDivElement>({
    focusKey,
    onEnterPress: () => onEnter?.(),
    onFocus: () => {
      ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      onFocus?.()
    },
    onBlur: () => onBlur?.(),
  })
  const isActive = useActive()
  const active = useRef(isActive)
  useLayoutEffect(() => {
    active.current = isActive
  }, [isActive])
  useEffect(() => {
    if (autoFocus && active.current) focusSelf()
  }, [autoFocus, focusSelf])
  return (
    <div ref={ref} className={`focusable ${focused ? 'focused' : ''} ${className}`} onClick={onEnter}>
      {children}
    </div>
  )
}
