# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Anime fans watching on their own Samsung TV. It started as the owner's app for a Samsung The Frame and is now shared on GitHub for others to install. They browse, pick up where they left off, and keep their AniList or MyAnimeList list up to date without touching a phone or computer, or use no account at all.

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

- Accounts are optional. AniList is the main list when linked, else MAL, else a list stored on the TV. With both linked, changes go to both unless sync is turned off; watched progress is the higher of the two.
- Shared as a GitHub release that people sign with their own Samsung certificate. Never published to the Samsung store.
- Episodes are marked watched at 85% on both services.
- Intro and outro times are auto-skipped only when AniSkip has times for the exact video length. Other times only show a Skip prompt.
- The TV's own player handles HLS on Tizen; hls.js is only used in the dev browser.
- Samsung TVs cannot copy video frames into a canvas, so any preview image must come from the source (thumbnail sprites), not from the playing video.
- Planned: watch list by status, new episodes row, filler badges, airing schedule, recommendations.

## Evidence on Hand

- Live data from AniList, MAL, miruro and AniSkip. No reviews or user research exist and none should be invented.

## Product Principles

- Next episode first: the thing most likely wanted is focused on arrival.
- Only offer what works: hide options a source does not actually have.
- The list stays true: every watch updates the linked lists without extra steps.
- The remote is the only input: every action reachable with arrows, OK and Back.
- Readable across the room in any light.
