import type { ListItem, Status } from './types'

export const statusOrder: Status[] = ['watching', 'planning', 'paused', 'completed', 'dropped']
export const statusLabels: Record<Status, string> = { watching: 'Watching', planning: 'Planning', paused: 'Paused', completed: 'Completed', dropped: 'Dropped' }

export function newEpisodes(items: ListItem[]): ListItem[] {
  return items
    .filter((i) => i.entry.status === 'watching' && i.nextAiring && i.aired !== undefined && i.aired > i.entry.progress)
    .sort((a, b) => b.nextAiring!.at - a.nextAiring!.at)
}

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function dayName(at: number, now = Date.now()): string {
  const start = (t: number) => new Date(t).setHours(0, 0, 0, 0)
  const diff = Math.round((start(at) - start(now)) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return days[new Date(at).getDay()]
}

export function clock(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function progressLabel(item: ListItem): string {
  const { progress, status } = item.entry
  const total = item.card.episodes
  if (status === 'completed') return total ? `${total} episodes` : 'Finished'
  if (item.aired !== undefined && item.nextAiring && item.aired > progress) return `${item.aired - progress} new`
  if (item.nextAiring && progress >= (item.aired ?? 0)) return `Episode ${item.nextAiring.episode} ${dayName(item.nextAiring.at)} ${clock(item.nextAiring.at)}`
  if (!progress) return total ? `${total} episodes` : 'Not started'
  return total ? `Watched ${progress} of ${total}` : `Watched ${progress}`
}
