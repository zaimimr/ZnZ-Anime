import type { Lang } from './types'

export interface Settings {
  sourceOrder: string[]
  lang: Lang
  autoSkipIntro: boolean
  autoplayNext: boolean
  skipFiller: boolean
}

const KEY = 'znz.settings'
const defaults: Settings = { sourceOrder: ['miruro'], lang: 'sub', autoSkipIntro: true, autoplayNext: true, skipFiller: false }

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
