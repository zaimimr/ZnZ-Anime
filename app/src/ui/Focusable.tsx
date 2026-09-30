import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { type ReactNode, useEffect } from 'react'

export function Focusable({ onEnter, onFocus, focusKey, className = '', children, autoFocus }: { onEnter?: () => void; onFocus?: () => void; focusKey?: string; className?: string; children: ReactNode; autoFocus?: boolean }) {
  const { ref, focused, focusSelf } = useFocusable<unknown, HTMLDivElement>({
    focusKey,
    onEnterPress: () => onEnter?.(),
    onFocus: () => {
      ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      onFocus?.()
    },
  })
  useEffect(() => {
    if (autoFocus) focusSelf()
  }, [autoFocus, focusSelf])
  return (
    <div ref={ref} className={`focusable ${focused ? 'focused' : ''} ${className}`} onClick={onEnter}>
      {children}
    </div>
  )
}
