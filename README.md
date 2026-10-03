<p align="center">
  <img src="static/android-chrome-192x192.png" width="96" alt="Cabin Music logo" />
</p>

<h1 align="center">Cabin Music</h1>

<p align="center">
  A lightweight, car-native web player for your personal <b>Plex</b> music library —
  built to run in the <b>Tesla browser</b>, deployed on Cloudflare.
</p>

<p align="center">
  <img alt="License: GPL v3" src="https://img.shields.io/badge/License-GPLv3-blue.svg" />
  <img alt="Svelte 5" src="https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white" />
  <img alt="SvelteKit" src="https://img.shields.io/badge/SvelteKit-adapter--static-FF3E00" />
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white" />
</p>

---

Cabin Music is a **client** for Plex. Audio and album art stream **straight from your Plex server
to the browser** — they never pass through the host. Only small JSON API calls are proxied (more on
that below). It's designed for the car: big touch targets, minimal-distraction layouts, a day/night
theme that follows the car, and a left/right-hand-drive option.

> **Status: feature-complete** for the original plan — skeleton → auth & discovery → browse →
> playback — plus discovery (radio/similar), favorites, audio-quality options, theming, and
> car-ergonomics polish.

## Features

**Pairing & connection**
- Plex PIN pairing by **QR scan** (sign in on your phone — no typing in the car).
- Automatic server + connection discovery (prefers local → remote → relay) with cached reconnect.

**Browse**
- Home in Plex style: **Mixes for you**, Recent plays, Recently added, On this day, recent Playlists, and a **Loved** row.
- **Artists**, **Albums**, **Playlists** (virtualized grids for 100k+ track libraries) and full-text **Search**.
- Pick which library is active (Settings) for multi-library servers.

**Playback**
- Tap-to-play any track/album/playlist; an always-visible Now Playing bar and a full-screen player.
- **Up-next queue** — view, reorder, remove, add-to-queue, play-next.
- Shuffle, repeat, seek, and **resume where you left off** (progress is reported back to Plex).
- Full-screen player with an **UltraBlur** backdrop, swipe-down to dismiss, and tappable artist/album.
- OS / car **Media Session** metadata (title, artist, artwork).
- **Keeps the car's audio between tracks** — an inaudible keep-alive holds the browser's media session
  across every track change (see [How it works](#how-it-works)).

**Discovery** *(needs Plex Pass + music sonic analysis)*
- **Mixes for you** and **Artist Mix** → endless artist radio.
- **Track Radio** — a station from the song you're hearing.
- **Similar artists** on artist pages, and **Shuffle all** across your whole library.

**Favorites**
- One-tap **heart** to love a track (stored as a Plex 5★ rating) and a **Loved** home row to find them.

**Audio & display**
- **Streaming quality**: Original/lossless (direct play) or capped MP3 tiers, with transcode fallback for unsupported codecs.
- **Light / dark / auto** theme — *auto* follows the car's day/night.
- **Left- or right-hand-drive** layout — RHD mirrors the menu and on-screen controls to the side nearest the driver.
- **Display size** — one setting scales the whole interface, since the car browser's built-in zoom isn't adjustable and has changed between Tesla updates.
- Edge-cached album art and oversized, minimal-distraction controls.

## How it works

- **Pure client-side SPA.** Audio (`<audio>` direct-play URLs) and artwork stream directly from your
  Plex server to the browser. None of it transits the host.
- **A tiny Cloudflare Worker** ([`worker/index.ts`](worker/index.ts)) sits in front of the static
  assets and does two things: it **proxies the Plex JSON API** at `/plex` (recent Plex versions
  removed the per-server "allowed CORS origins" setting, so a same-origin proxy is needed once the app
  is deployed to a public origin), and it **edge-caches album art** at `/img`. In local dev the app
  talks to Plex directly.
- **Your Plex token never leaves the browser** — it lives in `localStorage` and is only sent on
  requests to your own server (proxied same-origin in production).
- **Plex Pass** with completed **music sonic analysis** unlocks the discovery features (mixes, track
  radio, similar). Everything else works without it.
- **The keep-alive.** Chromium drops a page's media session the instant its only playing element
  ends, and rebuilds it only once the next track has loaded. The car appears to read that lapse as
  "browser audio ended" (its own media source comes back for the length of the gap, and with the
  browser off screen the next track never starts). So alongside the music Cabin loops a second
  `<audio>` element holding a 20 Hz tone at −60 dBFS (inaudible), which keeps the session alive from
  one track to the next. **Settings → Between tracks** switches it to pure silence or off.

## Requirements

- **Node 20+** and npm.
- A **Plex Media Server** (with **Remote Access** enabled for use away from your LAN) and a Plex account.
- *Recommended:* **Plex Pass** with music sonic analysis run, for the discovery features.
- A **Cloudflare account** (free tier is plenty) to deploy.

## Develop

```sh
npm install
npm run dev          # http://localhost:5173 — pair by scanning the QR with your phone
npm run check        # type-check (svelte-check)
npm run check:focus  # with `npm run dev` running: plays a queue in headless Chrome and checks the
                     # page never loses audio focus between tracks (needs Chrome; CHROME=/path to override)
npm run build        # -> ./build  (static SPA)
npm run preview      # serve ./build locally
```

## Deploy (Cloudflare Workers)

The app deploys as Cloudflare **Workers Static Assets**: the Worker serves the SPA and proxies
`/plex` + `/img`. Config is in [`wrangler.jsonc`](wrangler.jsonc) (Worker name `cabin-svelte`).

```sh
npx wrangler login   # one-time (or set CLOUDFLARE_API_TOKEN)
npm run deploy       # = npm run build && wrangler deploy
```

Optionally add a custom domain in the Cloudflare dashboard (e.g. `music.yourdomain.com`).

## Private mode (optional access gate)

By default the deployed app is reachable by anyone who has the URL. Your **music is still safe**
(nobody can browse it without pairing with *your* Plex account), but the Worker's `/plex` and `/img`
routes act as an open Plex proxy for whoever finds the URL. To make an instance **private**, set a
shared passphrase:

```sh
wrangler secret put CABIN_PASSPHRASE      # type a strong passphrase when prompted
npm run deploy
```

With the secret set, the Worker refuses to proxy `/plex` or `/img` without a valid `cabin_auth`
cookie. On first load the app shows an **access screen**; enter the passphrase **once** and a
long-lived (`HttpOnly`, `Secure`, 1-year) cookie keeps that browser unlocked — ideal for the car,
which has no email or second device. The passphrase itself is never stored in the cookie (the cookie
is an HMAC of it) and never ships to the browser.

- **Use a strong passphrase.** There's no server-side rate limiting (the gate is deliberately a
  stateless, single-secret check), so its security rests on the passphrase's entropy — pick a long
  one. For extra hardening you can add a Cloudflare **Rate Limiting** rule on `/auth` in the dashboard.
- **To rotate / revoke:** run `wrangler secret put CABIN_PASSPHRASE` again and redeploy — every
  existing cookie is instantly invalidated and all clients must re-enter the new passphrase.
- **Leave the secret unset** to keep the app fully open (the default; forks are unaffected).
- **Local testing:** copy [`.dev.vars.example`](.dev.vars.example) to `.dev.vars` (gitignored) and
  run `npm run build && npx wrangler dev` to exercise the gate.

> The gate protects your **data** (the Plex proxy + artwork), not the static app shell — the shell is
> just public JS with no secrets in it. Audio/artwork that stream directly from `plex.direct` are
> already protected by your Plex token.

## Tech

Svelte 5 (runes) · SvelteKit + `adapter-static` (SPA, `ssr=false`) · Vite (`es2022`) · TypeScript ·
Cloudflare Workers. Pairing QR via [`qrcode`](https://www.npmjs.com/package/qrcode).

## Known limitations

- **Tesla native media widget:** the card on the map screen can't drive prev/next/seek for a web
  `<audio>` source (the car only gives `<audio>` minimal controls, and gives `<video>` full controls
  but disables them while driving) — a platform limitation, not something the web app can fix. The
  in-app controls and the steering-wheel buttons work as normal.
- Targets the car's Chromium (~109), so a few newer CSS/JS features are avoided.

## License

[GPL-3.0](LICENSE).

## Disclaimer

Not affiliated with or endorsed by Plex or Tesla. "Plex" and "Tesla" are trademarks of their
respective owners. This is a personal, self-hosted client for your own Plex library.
