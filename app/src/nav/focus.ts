import { doesFocusableExist, getCurrentFocusKey, ROOT_FOCUS_KEY, setFocus } from '@noriginmedia/norigin-spatial-navigation'

export function recoverFocus(): boolean {
  const key = getCurrentFocusKey()
  if (key && key !== ROOT_FOCUS_KEY && doesFocusableExist(key)) return false
  setFocus(ROOT_FOCUS_KEY)
  return true
}
