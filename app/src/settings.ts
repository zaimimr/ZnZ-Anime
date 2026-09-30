import type { Lang } from './types'

export interface Settings {
  sourceOrder: string[]
  lang: Lang
  autoSkipIntro: boolean
  autoSkipOutro: boolean
  autoplayNext: boolean
  skipFiller: boolean
  syncBoth: boolean
}

const KEY = 'znz.settings'
const defaults: Settings = { sourceOrder: ['miruro'], lang: 'sub', autoSkipIntro: true, autoSkipOutro: true, autoplayNext: true, skipFiller: false, syncBoth: true }

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
