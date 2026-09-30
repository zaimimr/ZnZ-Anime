import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { type ReactNode, useEffect } from 'react'

export function Focusable({ onEnter, focusKey, className = '', children, autoFocus }: { onEnter?: () => void; focusKey?: string; className?: string; children: ReactNode; autoFocus?: boolean }) {
  const { ref, focused, focusSelf } = useFocusable<unknown, HTMLDivElement>({
    focusKey,
    onEnterPress: () => onEnter?.(),
    onFocus: () => ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
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
