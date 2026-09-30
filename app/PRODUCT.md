# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person, the owner, watching anime on their own Samsung The Frame TV. They browse, pick up where they left off, and keep their AniList and MyAnimeList lists up to date without touching a phone or computer.

## Product Purpose

ZnZ Anime is a personal TV app for finding, playing and tracking anime. Success means opening the app, getting to the next episode in one or two presses, and never having to fix a list by hand afterwards.

## Positioning

One app that joins three things usually spread across sites: the AniList list, MAL kept in sync, and playback from swappable streaming sources, all driven by the TV remote.

## Operating Context

- Watched on a 1920x1080 Tizen web app on a Samsung The Frame, both in the evening with lights low and in a bright living room during the day.
- Controlled only with the Samsung remote: arrows, OK, Back, play/pause, rewind and fast forward.
- Streams come from miruro providers, often through the `znz-auth` Cloudflare Worker proxy. Servers differ in quality, subtitles and whether they offer dub or preview images.
- Login uses QR pairing through the worker.

## Capabilities and Constraints

- AniList is the main list. MAL is kept in sync from it; watched progress is the higher of the two.
- Personal use only. The app is never published to the Samsung store or shared.
- Episodes are marked watched at 85% on both services.
- Intro and outro times come from miruro, with AniSkip as backup.
- The TV's own player handles HLS on Tizen; hls.js is only used in the dev browser.
- Samsung TVs cannot copy video frames into a canvas, so any preview image must come from the source (thumbnail sprites), not from the playing video.
- Planned: watch list by status, new episodes row, filler badges, airing schedule, recommendations.

## Evidence on Hand

- Live data from AniList, MAL, miruro and AniSkip. No screenshots, reviews or other users exist and none should be invented.

## Product Principles

- Next episode first: the thing most likely wanted is focused on arrival.
- Only offer what works: hide options a source does not actually have.
- The list stays true: every watch updates AniList and MAL without extra steps.
- The remote is the only input: every action reachable with arrows, OK and Back.
- Readable across the room in any light.
