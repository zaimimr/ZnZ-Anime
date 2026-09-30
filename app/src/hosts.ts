const dev = import.meta.env.MODE === 'development'

export const hosts = {
  anilist: 'https://graphql.anilist.co',
  mal: dev ? '/x/mal' : 'https://api.myanimelist.net',
  miruro: dev ? '/x/miruro' : 'https://www.miruro.to',
  aniskip: 'https://api.aniskip.com',
  auth: (import.meta.env.VITE_AUTH_URL as string | undefined) ?? '',
}
