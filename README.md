# Cabin

A lightweight, car-native web front-end for a personal **Plex** music server, built to load in the **Tesla browser**. Cabin is a _client_ to Plex: audio streams directly from the Plex server to the car. Our hosting (Cloudflare static assets) only serves the SPA bundle — audio never transits our infrastructure.

> **Status: Phase 0 — Skeleton.** A SvelteKit + `adapter-static` SPA that builds and runs locally and renders a placeholder screen. No Plex integration yet. See the kickoff spec for the full plan (Phase 1 = auth + discovery, Phase 2 = browse, Phase 3 = playback, …).

## Stack

- **Svelte 5 + SvelteKit**, `adapter-static` with SPA fallback (`fallback: index.html`)
- **Vite** — `build.target: es2022` (the car runs the official Plex SPA; drop to `es2019` only if it misbehaves on-car)
- Pure client-rendered SPA: `ssr = false`, `prerender = false` (`src/routes/+layout.ts`)
- Hosting: **Cloudflare static assets** (free tier) — `wrangler.jsonc`

## Develop

```sh
npm install
npm run dev              # dev server with HMR
npm run dev -- --open    # …and open a browser
```

## Build & preview the production SPA locally

```sh
npm run build            # -> ./build (static SPA)
npm run preview          # serve ./build locally
```

## Deploy (Cloudflare) — not wired yet

Requires a Cloudflare account and a custom domain on an existing zone.

```sh
npx wrangler login       # one-time auth (or set CLOUDFLARE_API_TOKEN)
npm run deploy           # = npm run build && wrangler deploy
```

Then in the Cloudflare dashboard: project → **Settings → Domains & Routes** → add the custom subdomain (e.g. `music.yourdomain.com`). Static-asset requests are free and unlimited.

## Notes

- Design tokens (dark, high-contrast, ≥72px touch targets, Tesla-red accent) live in [`src/app.css`](src/app.css).
- An optional thin Worker proxy (Plex JSON/auth only — **never audio**) can be added later if CORS misbehaves in-car; see spec §6. The hook is commented in [`wrangler.jsonc`](wrangler.jsonc).
