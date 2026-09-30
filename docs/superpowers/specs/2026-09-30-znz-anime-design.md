# ZnZ Anime - Design

Date: 2026-09-30
Status: Draft for review

## Goal

A personal, TV-native anime app for a Samsung 65" The Frame Pro (2025, Tizen 9). Browse and track anime through AniList, keep MyAnimeList in sync, and play episodes in a native player driven by the remote. The streaming site behind it is a swappable source, so the app survives when a site goes down.

## Success criteria

- Log in to AniList and MAL from the TV without typing a password on the remote.
- Home screen shows Continue Watching, Top Trending (Day / Week / Month), Airing This Season and Planning.
- Pick an anime, pick an episode, and it plays full screen with sub/dub choice, subtitles and remote controls.
- Watching past 85% of an episode updates progress on both AniList and MAL.
- A one-time merge fixes the current drift between the AniList and MAL lists.
- Adding a new streaming site means adding one adapter file and registering it, nothing else.

## Out of scope for v1

- Downloads and offline viewing.
- Multiple profiles.
- Anime that exist only on MAL.
- A second source adapter (ReAnime is a candidate once miruro works).
- Samsung store publishing. The app is sideloaded in Developer Mode.

## Architecture

Three parts in one pnpm workspace repo:

1. **`app/`**: Tizen web app. TypeScript, React, Vite, built for ES2020 (Tizen 9 ships a modern Chromium). Remote navigation with `@noriginmedia/norigin-spatial-navigation`. Packaged as a `.wgt`.
2. **`worker/`**: `znz-auth` Cloudflare Worker. Holds OAuth client secrets, runs QR pairing, refreshes MAL tokens, and offers a fallback stream proxy.
3. **Source adapters** live in `app/src/sources/`, one file per site.

```
znz-anime/
  app/
    config.xml          Tizen manifest, <access origin="*" subdomains="true"/>
    src/
      anilist/          GraphQL client: lists, search, details, save progress, mediaTrends
      mal/              REST client (API v2): list read and write
      sync/             one-time merge + dual-write + retry queue
      trending/         Day / Week / Month aggregation from mediaTrends
      sources/          SourceAdapter interface, registry, miruro adapter
      player/           hls.js player, remote keys, skip intro, next episode, progress
      screens/          Home, Search, Details, Player, Settings, Pair
      nav/              spatial navigation setup, key codes, Back handling
  worker/
    src/                pair, callback, refresh, proxy routes
  docs/superpowers/specs/
```

## Source adapter contract

```ts
interface SourceAdapter {
  id: string
  resolve(media: { anilistId: number; titles: string[] }): Promise<SourceShow | null>
  episodes(show: SourceShow): Promise<Episode[]>
  stream(show: SourceShow, ep: number, lang: 'sub' | 'dub'): Promise<Stream[]>
}

interface Stream {
  provider: string
  url: string
  format: 'hls' | 'mp4'
  quality?: string
  headers?: Record<string, string>
  subtitles: { url: string; lang: string; label: string; default?: boolean }[]
  skip?: { kind: 'op' | 'ed'; start: number; end: number }[]
}
```

`stream()` returns a list of streams, best first. The player tries them in order. The registry holds adapters in the order the user sets in Settings. If an adapter returns nothing or every stream fails, the app moves to the next adapter.

## Miruro adapter (verified 2026-09-30)

Findings from a browser capture and plain `fetch` tests:

- Base: `https://www.miruro.to/api/v1`. Plain `fetch` with `Referer: https://www.miruro.to/` works. No browser fingerprinting.
- Responses are `application/octet-stream`: XOR with the bytes of `"miruro/catalog"` (repeating), then gunzip. Error responses are plain `application/problem+json`.
- `limit` only accepts certain values. `limit=2` returns 400, `limit=5` and `limit=15` work. The adapter uses `limit=5`.
- There is no lookup by AniList ID (`anilist_id_in` returns 400 even in the browser).
- Resolve: `GET /anime?q=<title>&limit=5&sort=-popularity`, then pick the result whose `external_ids.anilist` contains the AniList ID. Try romaji, then English, then native title.
- Episodes: `GET /anime/{id}/episodes?kind=regular&limit=10000`.
- Play: `GET /anime/{id}/episodes/{n}/play` returns `tracks[]` (`sub`, `dub`, `ssub`), each with `providers[]` (seen: animepahe, aniwaves, kickassanime, anikoto, icarus), each with `servers[]` carrying `headers` and `streams[]` (`url`, `format`, `quality`), plus `subtitles` and `skip_times` when available.
- Raw stream URLs need the server's `Referer` (403 without it). A TV web app cannot set `Referer` on media requests. Miruro's own proxy (`s1.keeply.top`) needs a key from `/env2.js`, which Cloudflare blocks for non-browser clients, so the app does not depend on it. The adapter returns raw URLs plus required headers, and the player sends them through the `znz-auth` `/proxy` route, which adds the `Referer` and rewrites playlist URLs.
- No miruro or MAL endpoint sends CORS headers. On the TV, `<access origin="*">` in `config.xml` allows the requests. In desktop development, the Vite dev server proxies `/x/miruro` and `/x/mal`.
- Brittleness: miruro can change any of this at any time. `pnpm check:sources` detects it.

## Data flow

### Login

AniList blocks OAuth token requests from Cloudflare Workers (403, seen 2026-09-30), so AniList uses the implicit grant: `/login/:code` sets an HttpOnly `znz_pair` cookie and redirects with `response_type=token`, AniList returns the token in the URL fragment to `/callback/anilist`, and that page posts it to `/callback/anilist/token`. The Worker never calls AniList and holds no AniList secret. MAL keeps the code flow below.

#### MAL code flow

1. TV calls `POST /pair` on the Worker and receives `{ code, pairUrl }`.
2. TV shows a QR code for `pairUrl` and the short code.
3. On the phone, `pairUrl` redirects to the AniList or MAL OAuth page (MAL with PKCE). The provider redirects to the Worker callback.
4. The Worker exchanges the code for tokens and stores them in KV under `code` with a 5 minute TTL.
5. TV polls `GET /pair/:code` every 2 seconds, receives the tokens once, and the Worker deletes the KV entry.
6. TV stores tokens in `localStorage`. MAL refresh goes through `POST /refresh/mal`. AniList tokens last about a year.

### First merge (once, after both accounts are linked)

1. Fetch the full AniList list and the full MAL list (paged, 1000 per page).
2. Match entries on `idMal` from AniList. Unmatched entries go into an "unmatched" report in Settings.
3. Merge rules per anime:
   - Status rank: Completed > Watching > Paused > Planning. Dropped only wins if both sides are Dropped.
   - Progress: the higher value.
   - Score: AniList if set, otherwise MAL.
4. Show a preview ("47 changes on MAL, 12 on AniList") and wait for confirm.
5. Write in batches that respect rate limits (AniList about 90 requests per minute).

### Ongoing sync

- Every change (episode watched, status, score) is written to AniList first, then MAL.
- A failed MAL write goes into a retry queue in `localStorage`, retried on the next app start.
- The UI reads from AniList.

### Playback

1. Details screen calls `resolve`, then `episodes`.
2. Selecting an episode calls `stream(show, ep, lang)`.
3. The player loads the first stream with `hls.js`, resuming from the saved position (stored per anime and episode in `localStorage`).
4. Subtitles load as `<track>` elements. Skip intro and outro buttons appear when `skip` data exists.
5. At 85% watched, progress is saved to AniList and MAL.
6. At the end, a 10 second countdown starts the next episode.

### Trending (Day / Week / Month)

- AniList's global `Page.mediaTrends` list returns nothing without a `mediaId` filter (checked 2026-09-30), so the app uses per-anime trend history instead.
- Query `Page.media(sort: TRENDING_DESC)` with `trends(sort: DATE_DESC, perPage: 30) { nodes { date trending } }`: 1 page (50 anime) for Day, 2 for Week, 3 for Month.
- Sum `trending` for the days inside the window per anime, rank the top 50. Covers come from the same query.
- Cache each window in `localStorage` for 1 hour.

## Error handling

- Source down: fall through to the next stream, then the next adapter. If all fail, show "No source available" with Retry. AniList details still show.
- Stream stall: `hls.js` recovers up to 3 times, then the player moves to the next stream at the same position.
- Expired AniList token: show the pairing QR screen. MAL refreshes silently and only shows the QR screen if refresh fails.
- 429 from AniList or MAL: wait for `Retry-After`, then retry. The merge job can pause and resume.
- Offline: banner at the top, cached home rows still show.

## Remote controls

- D-pad: move focus. Enter: select. Back: go back, or exit the player.
- Player: Play/Pause key and Enter toggle playback. Left/Right seek 10 seconds. Up opens the episode and source picker. Down shows the progress bar.
- Register the Tizen media keys with `tizen.tvinputdevice.registerKey`.

## Testing

- Vitest unit tests: merge rules (table of cases), trending aggregation, retry queue, miruro decoding and parsing against saved fixtures.
- `pnpm check:sources`: runs each adapter against the live site with a known anime (Frieren, AniList 154587) and reports what broke.
- Worker: plain Vitest against the fetch handler, with an in-memory KV fake and a stubbed `fetch`, for pairing, refresh and proxy.
- Manual: desktop Chrome at 1920x1080 with arrow keys, then `tizen install` on the TV for a final check.

## Setup notes

- Tizen 9 sideloading needs a Samsung certificate tied to the TV's DUID, created once in Tizen Studio Certificate Manager.
- AniList and MAL OAuth apps are registered with the Worker callback URL as redirect.
- Worker secrets: `ANILIST_CLIENT_ID`, `ANILIST_CLIENT_SECRET`, `MAL_CLIENT_ID`, `MAL_CLIENT_SECRET`.

## Risks

- Miruro can change its API, encoding or proxy, or go down. Mitigation: adapter isolation, fallback proxy, `check:sources`.
- Miruro and similar sites serve unlicensed streams. This is a personal project, and the adapter design allows a licensed source later.
- MAL's API has no official rate limit. The merge uses small batches with delays.
