export type Provider = 'anilist' | 'mal'
export type Status = 'watching' | 'rewatching' | 'completed' | 'paused' | 'dropped' | 'planning'
export type Lang = 'sub' | 'dub'
export interface Tokens { accessToken: string; refreshToken?: string; expiresAt: number }
export interface ListEntry { anilistId?: number; malId?: number; title: string; status: Status; progress: number; score: number; updatedAt?: number }
export type Change = Omit<ListEntry, 'title'> & { title?: string }
export interface Card { id: number; idMal?: number; title: string; titles: string[]; cover: string; episodes?: number }
export interface Airing { episode: number; at: number }
export interface ListItem { entry: ListEntry; card: Card; updatedAt: number; listId?: number; aired?: number; nextAiring?: Airing }
