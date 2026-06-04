// Cloudflare Worker for the deployed Cabin app.
//  - GET/POST /plex?url=<encoded plex.direct URL> → fetch it server-side (no browser CORS) and
//    return it with permissive CORS headers. This lets the SPA reach the Plex server's JSON API
//    even though recent Plex versions removed the "allowed CORS origins" setting.
//  - GET /img?url=<encoded plex.direct /photo URL> → proxy + EDGE-CACHE artwork so repeat views are
//    served from Cloudflare (and the home server does far fewer on-the-fly transcodes).
//  - Everything else → serve the static SPA (with SPA fallback) via the ASSETS binding.
// Audio is NOT proxied — the SPA points <audio> straight at plex.direct (no CORS needed).

interface Env {
	ASSETS: { fetch: (request: Request) => Promise<Response> };
}

// SSRF guard: only proxy to Plex's own hosts.
const PLEX_HOST = /(^|\.)plex\.direct$/i;

const ART_MAX_AGE = 2592000; // 30d — Plex thumb URLs are versioned, so changed art = a new URL.

/** Parse + SSRF-check the ?url= target; returns the URL or an error Response. */
function plexTarget(url: URL): URL | Response {
	const target = url.searchParams.get('url');
	if (!target) return new Response('missing url', { status: 400 });
	let t: URL;
	try {
		t = new URL(target);
	} catch {
		return new Response('bad url', { status: 400 });
	}
	if (t.protocol !== 'https:' || !PLEX_HOST.test(t.hostname)) {
		return new Response('forbidden target', { status: 403 });
	}
	return t;
}

function corsHeaders(origin: string): Record<string, string> {
	return {
		'access-control-allow-origin': origin || '*',
		'access-control-allow-methods': 'GET,POST,OPTIONS',
		'access-control-allow-headers': 'Accept,Content-Type',
		'access-control-max-age': '86400',
		vary: 'Origin'
	};
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/plex') {
			const origin = request.headers.get('Origin') || '*';
			if (request.method === 'OPTIONS') {
				return new Response(null, { status: 204, headers: corsHeaders(origin) });
			}

			const target = url.searchParams.get('url');
			if (!target) return new Response('missing url', { status: 400, headers: corsHeaders(origin) });

			let t: URL;
			try {
				t = new URL(target);
			} catch {
				return new Response('bad url', { status: 400, headers: corsHeaders(origin) });
			}
			if (t.protocol !== 'https:' || !PLEX_HOST.test(t.hostname)) {
				return new Response('forbidden target', { status: 403, headers: corsHeaders(origin) });
			}

			const init: RequestInit = { method: request.method, headers: { Accept: 'application/json' } };
			if (request.method !== 'GET' && request.method !== 'HEAD') {
				const body = await request.text();
				if (body) init.body = body;
			}

			let upstream: Response;
			try {
				upstream = await fetch(t.toString(), init);
			} catch {
				return new Response('upstream unreachable', { status: 502, headers: corsHeaders(origin) });
			}

			const headers = new Headers(corsHeaders(origin));
			const ct = upstream.headers.get('content-type');
			if (ct) headers.set('content-type', ct);
			return new Response(upstream.body, { status: upstream.status, headers });
		}

		if (url.pathname === '/img') {
			const t = plexTarget(url);
			if (t instanceof Response) return t; // 400/403 — client falls back to the direct URL

			let upstream: Response;
			try {
				const init: RequestInit & { cf?: Record<string, unknown> } = {
					method: 'GET',
					// Edge-cache successful transcodes for 30d; never cache errors.
					cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': ART_MAX_AGE, '400-599': 0 } }
				};
				upstream = await fetch(t.toString(), init);
			} catch {
				return new Response('upstream unreachable', { status: 502, headers: { 'cache-control': 'no-store' } });
			}

			const headers = new Headers();
			const ct = upstream.headers.get('content-type');
			if (ct) headers.set('content-type', ct);
			// Tell the car's browser to cache art hard too (versioned URLs make this safe).
			headers.set('cache-control', upstream.ok ? `public, max-age=${ART_MAX_AGE}, immutable` : 'no-store');
			return new Response(upstream.body, { status: upstream.status, headers });
		}

		return env.ASSETS.fetch(request);
	}
};
