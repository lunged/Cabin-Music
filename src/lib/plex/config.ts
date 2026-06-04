// Cabin Music — Plex client configuration & constants.
// The base URLs are the single place to flip if a Worker proxy is ever added (spec §6):
// only PLEX_TV_BASE would change; audio/media URLs always point straight at the server.

export const PLEX_PRODUCT = 'Cabin Music';
export const PLEX_VERSION = '0.1.0';

/** plex.tv account API (auth + resource discovery). Proven CORS-open to browser origins. */
export const PLEX_TV_BASE = 'https://plex.tv/api/v2';
/** Where the user authorizes a PIN (opened on their phone). */
export const PLEX_AUTH_APP = 'https://app.plex.tv/auth';
/** Manual fallback: user visits this and types the 4-char code. */
export const PLEX_LINK_FALLBACK = 'https://plex.tv/link';

/** PIN polling cadence and per-request timeout. */
export const POLL_INTERVAL_MS = 2000;
export const POLL_REQ_TIMEOUT_MS = 8000;
/** Cheap reachability probe (GET {server}/identity) timeout. */
export const PROBE_TIMEOUT_MS = 3500;
/** Resource discovery can be a touch slower. */
export const RESOURCES_TIMEOUT_MS = 10000;

/** localStorage key namespace, so we can wipe everything on sign-out with a prefix scan. */
export const STORAGE_PREFIX = 'cabin.';

/** Debug panel ring-buffer length. */
export const MAX_LOG = 30;

/** Same-origin Worker proxy for server (plex.direct) JSON calls — used in production only, so the
 *  deployed app doesn't depend on a Plex CORS-allowlist setting (recent Plex versions removed it).
 *  Audio still streams directly (no CORS needed for <audio>). */
export const PLEX_PROXY_PATH = '/plex';

/** Same-origin Worker route for artwork (production only): proxies + edge-caches /photo transcodes so
 *  repeat views are served from Cloudflare (fast) and the home server does far fewer transcodes. The
 *  client falls back to the direct plex.direct URL if a proxied image fails. */
export const PLEX_IMG_PATH = '/img';
