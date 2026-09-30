# ZnZ Anime

Personal anime app for a Samsung The Frame (Tizen). Browse and track with AniList, keep MyAnimeList in sync, and play episodes from a swappable streaming source.

## Parts

- `app/`: Tizen web app (Vite, React, TypeScript)
- `worker/`: `znz-auth` Cloudflare Worker for QR login, MAL token refresh and the stream proxy, deployed at `https://znz-auth.zaim-imran.workers.dev`

## Develop

```bash
pnpm install
pnpm test
cp app/.env.example app/.env.local   # set VITE_AUTH_URL
pnpm dev                              # open http://localhost:5173 at 1920x1080, use arrow keys, Enter and Escape
pnpm check:sources                    # checks each streaming source against the live site
```

## Worker

```bash
cd worker
npx wrangler secret put ANILIST_CLIENT_ID
npx wrangler secret put ANILIST_CLIENT_SECRET
npx wrangler secret put MAL_CLIENT_ID
npx wrangler secret put MAL_CLIENT_SECRET
npx wrangler deploy
```

OAuth apps:

- AniList: https://anilist.co/settings/developer, redirect URL `https://znz-auth.zaim-imran.workers.dev/callback/anilist`
- MAL: https://myanimelist.net/apiconfig, app type web, redirect URL `https://znz-auth.zaim-imran.workers.dev/callback/mal`

## Install on the TV

1. TV in Developer Mode with this Mac's IP, then `~/tizen-studio/tools/sdb connect <tv-ip>`.
2. `pnpm --filter app package:tv` builds and signs `app/dist/ZnZAnime.wgt` with the `TVMate` certificate profile (override with `TIZEN_PROFILE`).
3. `~/tizen-studio/tools/ide/bin/tizen install -n app/dist/ZnZAnime.wgt -t <device from sdb devices>`
4. ZnZ Anime shows up under Apps.

## Add a source

Create `app/src/sources/<name>/index.ts` that implements `SourceAdapter` from `app/src/sources/types.ts`, register it in `app/src/sources/registry.ts`, and run `pnpm check:sources`.
