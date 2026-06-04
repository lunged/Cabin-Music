// Cloudflare Worker for the deployed Cabin app.
//  - GET/POST /plex?url=<encoded plex.direct URL> → fetch it server-side (no browser CORS) and
//    return it with permissive CORS headers. This lets the SPA reach the Plex server's JSON API
//    even though recent Plex versions removed the "allowed CORS origins" setting.
//  - Everything else → serve the static SPA (with SPA fallback) via the ASSETS binding.
// Audio + artwork are NOT proxied — the SPA points <audio>/<img> straight at plex.direct (those
// don't require CORS), so only small JSON transits the Worker.

interface Env {
	ASSETS: { fetch: (request: Request) => Promise<Response> };
}

// SSRF guard: only proxy to Plex's own hosts.
const PLEX_HOST = /(^|\.)plex\.direct$/i;

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

		return env.ASSETS.fetch(request);
	}
};
