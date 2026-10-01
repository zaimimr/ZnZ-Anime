import { FocusContext, getCurrentFocusKey, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useEffect } from 'react'
import { Focusable } from './Focusable'

export function ExitConfirm({ onStay }: { onStay: () => void }) {
  const { ref, focusKey } = useFocusable<unknown, HTMLDivElement>({ focusKey: 'exit-confirm', isFocusBoundary: true })
  useEffect(() => {
    const previous = getCurrentFocusKey()
    return () => void setFocus(previous)
  }, [])
  return (
    <FocusContext.Provider value={focusKey}>
      <div className="overlay">
        <div ref={ref} className="dialog">
          <h2>Exit ZnZ Anime?</h2>
          <div className="dialog-actions">
            <Focusable className="btn active" autoFocus onEnter={() => window.tizen?.application.getCurrentApplication().exit()}>Exit</Focusable>
            <Focusable className="btn" onEnter={onStay}>Stay</Focusable>
          </div>
        </div>
      </div>
    </FocusContext.Provider>
  )
}
