import { getSettings } from '../settings'

export function customHost(id: string): string {
  return getSettings().sourceHosts[id] ?? ''
}

export function sourceHost(id: string, defaultHost: string, devHost?: string): string {
  return customHost(id) || (import.meta.env.MODE === 'development' && devHost) || defaultHost
}
