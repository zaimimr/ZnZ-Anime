import type { Lang } from './types'

export interface Settings {
  sourceOrder: string[]
  lang: Lang
}

const KEY = 'znz.settings'
const defaults: Settings = { sourceOrder: ['miruro'], lang: 'sub' }

export function getSettings(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return defaults
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(settings))
}
