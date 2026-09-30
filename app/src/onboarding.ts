import { linked } from './library'

const KEY = 'znz.onboarded'

export function isOnboarded(): boolean {
  return localStorage.getItem(KEY) === '1' || linked().length > 0
}

export function finishOnboarding(): void {
  localStorage.setItem(KEY, '1')
}
