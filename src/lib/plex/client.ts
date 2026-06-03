// plexFetch — the single network choke point. Every Plex call goes through here so that:
//  - headers + Accept:json are consistent,
//  - the token is never logged (URLs are masked before hitting the debug store),
//  - timeouts + caller aborts are honored, and
//  - every call (success or failure) lands in the debug panel.
//
// Note: avoids AbortSignal.any / AbortSignal.timeout (both post-date the car's Chromium ~109);
// signals are combined manually with a plain AbortController + setTimeout.

import { PLEX_TV_BASE, POLL_REQ_TIMEOUT_MS } from './config';
import { plexHeaders } from './identifiers';
import { logCall } from '$lib/stores/debug.svelte';

export class PlexError extends Error {
	status: number | null;
	url: string;
	isTimeout: boolean;
	body?: string;
	constructor(
		message: string,
		opts: { status?: number | null; url: string; isTimeout?: boolean; body?: string }
	) {
		super(message);
		this.name = 'PlexError';
		this.status = opts.status ?? null;
		this.url = opts.url;
		this.isTimeout = opts.isTimeout ?? false;
		this.body = opts.body;
	}
}

export interface PlexFetchOpts {
	method?: string;
	token?: string | null;
	tokenIn?: 'header' | 'query';
	base?: string;
	query?: Record<string, string | number | boolean | undefined>;
	signal?: AbortSignal;
	timeoutMs?: number;
	/** Probe mode: send only `Accept` (no X-Plex-* headers) so the request stays "simple"
	 *  (no CORS preflight). Used for the token-less /identity reachability check. */
	minimalHeaders?: boolean;
}

function buildUrl(base: string, path: string, query?: PlexFetchOpts['query']): string {
	const url = new URL(base.replace(/\/+$/, '') + path);
	if (query) {
		for (const [k, v] of Object.entries(query)) {
			if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
		}
	}
	return url.toString();
}

function maskUrl(url: string): string {
	return url.replace(/(X-Plex-Token=)[^&]+/gi, '$1••••');
}

export async function plexFetch<T>(path: string, opts: PlexFetchOpts = {}): Promise<T> {
	const {
		method = 'GET',
		token = null,
		tokenIn = 'header',
		base = PLEX_TV_BASE,
		query = {},
		signal,
		timeoutMs = POLL_REQ_TIMEOUT_MS,
		minimalHeaders = false
	} = opts;

	const finalQuery = { ...query };
	if (token && tokenIn === 'query') finalQuery['X-Plex-Token'] = token;
	const url = buildUrl(base, path, finalQuery);
	const masked = maskUrl(url);

	const headers: Record<string, string> = minimalHeaders
		? { Accept: 'application/json' }
		: plexHeaders();
	if (token && tokenIn === 'header') headers['X-Plex-Token'] = token;

	// Combine timeout + optional caller signal into one controller (Chromium-109-safe).
	const controller = new AbortController();
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);
	const onExternalAbort = () => controller.abort();
	if (signal) {
		if (signal.aborted) controller.abort();
		else signal.addEventListener('abort', onExternalAbort, { once: true });
	}

	const startedAt = performance.now();
	let status: number | null = null;
	let ok = false;
	let errMsg: string | undefined;

	try {
		const res = await fetch(url, { method, headers, signal: controller.signal });
		status = res.status;
		ok = res.ok;
		const text = await res.text();
		if (!res.ok) {
			throw new PlexError(`HTTP ${res.status}`, { status, url: masked, body: text.slice(0, 300) });
		}
		if (!text) return {} as T;
		try {
			return JSON.parse(text) as T;
		} catch {
			throw new PlexError('invalid JSON response', { status, url: masked });
		}
	} catch (e) {
		if (e instanceof PlexError) {
			errMsg = e.message;
			throw e;
		}
		const externallyAborted = !!signal?.aborted && !timedOut;
		const msg = timedOut ? 'timeout' : externallyAborted ? 'aborted' : 'unreachable (network or CORS)';
		errMsg = msg;
		throw new PlexError(msg, { status, url: masked, isTimeout: timedOut });
	} finally {
		clearTimeout(timer);
		if (signal) signal.removeEventListener('abort', onExternalAbort);
		logCall({
			t: Date.now(),
			method,
			url: masked,
			status,
			ms: Math.round(performance.now() - startedAt),
			ok,
			error: errMsg
		});
	}
}
