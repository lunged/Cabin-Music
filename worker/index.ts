// Cloudflare Worker for the deployed Cabin app.
//  - GET/POST /plex?url=<encoded plex.direct URL> → fetch it server-side (no browser CORS) and
//    return it with permissive CORS headers. This lets the SPA reach the Plex server's JSON API
//    even though recent Plex versions removed the "allowed CORS origins" setting.
//  - GET /img?url=<encoded plex.direct /photo URL> → proxy + EDGE-CACHE artwork so repeat views are
//    served from Cloudflare (and the home server does far fewer on-the-fly transcodes).
//  - GET/POST /auth → optional passphrase gate (see below). Everything else → serve the static SPA.
// Audio is NOT proxied — the SPA points <audio> straight at plex.direct (no CORS needed).
//
// ── Access control (optional, opt-in) ──────────────────────────────────────────────────────────
// If the `CABIN_PASSPHRASE` secret is set (`wrangler secret put CABIN_PASSPHRASE`), the /plex and
// /img proxy routes require a valid `cabin_auth` cookie; without the secret the app is fully open
// (the original behaviour, so public forks work unchanged). The cookie is minted by POST /auth with
// the correct passphrase and is an HMAC of the passphrase — the passphrase itself is never stored in
// a cookie or shipped to the client. Rotating the secret invalidates every existing cookie. The
// static SPA shell is always served (it holds no secrets); it just can't reach Plex until unlocked.

interface Env {
	ASSETS: { fetch: (request: Request) => Promise<Response> };
	/** Optional shared passphrase. When set, /plex + /img require the cabin_auth cookie. */
	CABIN_PASSPHRASE?: string;
}

// SSRF guard: only proxy to Plex's own hosts.
const PLEX_HOST = /(^|\.)plex\.direct$/i;

const ART_MAX_AGE = 2592000; // 30d — Plex thumb URLs are versioned, so changed art = a new URL.

const COOKIE_NAME = 'cabin_auth';
// Distinct 401 body for a GATE rejection, so the SPA can tell it apart from a Plex token 401 (which
// the Worker forwards verbatim) — the former re-shows the passphrase screen, the latter re-pairs.
// MUST match GATE_401_BODY in src/lib/plex/config.ts.
const GATE_401_BODY = 'cabin-locked';
const COOKIE_MAX_AGE = 31536000; // 1 year — enter the passphrase once in the car, stay unlocked.
// Constant HMAC message; rotating CABIN_PASSPHRASE (the HMAC key) is what invalidates old cookies.
const TOKEN_MESSAGE = 'cabin-auth-v1';

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
		'access-control-allow-credentials': 'true',
		'access-control-max-age': '86400',
		vary: 'Origin'
	};
}

/* ── Passphrase gate helpers ──────────────────────────────────────────────────────────────────── */

/** The configured passphrase, trimmed. Trimming here matches the client (AccessGate trims before
 *  submitting) and neutralizes an accidental trailing newline captured into the secret, so the two
 *  sides always HMAC the same bytes. Empty after trim ⇒ gate disabled. */
function secretOf(env: Env): string {
	return (env.CABIN_PASSPHRASE ?? '').trim();
}

function gateEnabled(env: Env): boolean {
	return secretOf(env).length > 0;
}

/** Hex HMAC-SHA256 of a fixed message, keyed by the passphrase. This IS the cookie value. */
async function computeToken(passphrase: string): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		enc.encode(passphrase),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, enc.encode(TOKEN_MESSAGE));
	return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time compare of two equal-length hex strings (both are 64-char SHA-256 digests). */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

function readCookie(header: string | null, name: string): string | null {
	if (!header) return null;
	for (const part of header.split(';')) {
		const eq = part.indexOf('=');
		if (eq === -1) continue;
		if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
	}
	return null;
}

/** True if the gate is off, or the request carries a valid cookie. */
async function isAuthed(request: Request, env: Env): Promise<boolean> {
	const secret = secretOf(env);
	if (!secret) return true;
	const cookie = readCookie(request.headers.get('Cookie'), COOKIE_NAME);
	if (!cookie) return false;
	const expected = await computeToken(secret);
	return timingSafeEqual(cookie, expected);
}

function json(obj: unknown, status = 200, extra: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(obj), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra }
	});
}

/** Handle /auth: GET reports gate status; POST verifies the passphrase and sets the cookie. */
async function handleAuth(request: Request, env: Env): Promise<Response> {
	const secret = secretOf(env);
	const enabled = secret.length > 0;

	if (request.method === 'GET') {
		return json({ enabled, authed: await isAuthed(request, env) });
	}

	if (request.method === 'POST') {
		// Gate off → nothing to unlock; report success so the SPA proceeds.
		if (!enabled) return json({ ok: true });

		let submitted = '';
		try {
			const body = (await request.json()) as { passphrase?: unknown };
			if (typeof body?.passphrase === 'string') submitted = body.passphrase.trim();
		} catch {
			submitted = '';
		}

		const expected = await computeToken(secret);
		// Compare HMACs (fixed length), never the raw passphrase; empty input is rejected outright.
		if (!submitted || !timingSafeEqual(await computeToken(submitted), expected)) {
			return json({ ok: false }, 401);
		}
		return json(
			{ ok: true },
			200,
			{
				'set-cookie': `${COOKIE_NAME}=${expected}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`
			}
		);
	}

	return new Response('method not allowed', { status: 405 });
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/auth') {
			if (request.method === 'OPTIONS') {
				return new Response(null, {
					status: 204,
					headers: corsHeaders(request.headers.get('Origin') || '*')
				});
			}
			return handleAuth(request, env);
		}

		if (url.pathname === '/plex') {
			const origin = request.headers.get('Origin') || '*';
			if (request.method === 'OPTIONS') {
				return new Response(null, { status: 204, headers: corsHeaders(origin) });
			}
			if (!(await isAuthed(request, env))) {
				return new Response(GATE_401_BODY, { status: 401, headers: corsHeaders(origin) });
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
			if (!(await isAuthed(request, env))) {
				return new Response(GATE_401_BODY, { status: 401, headers: { 'cache-control': 'no-store' } });
			}
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
