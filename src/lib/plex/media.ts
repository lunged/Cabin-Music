// Helpers for talking to the active media server: a token-prefilled fetch and artwork URLs.
// Server calls use the token as a QUERY param + minimal headers → "simple" requests with no CORS
// preflight (most robust against per-server CORS config; the dev origin is allowlisted).

import { plexFetch, type PlexFetchOpts } from './client';
import { session } from '$lib/stores/session.svelte';

type ServerOpts = Pick<PlexFetchOpts, 'query' | 'signal' | 'method' | 'timeoutMs'>;

export async function serverFetch<T>(path: string, opts: ServerOpts = {}): Promise<T> {
	const active = session.active;
	if (!active) throw new Error('Not connected to a server');
	return plexFetch<T>(path, {
		...opts,
		base: active.baseUri,
		token: active.accessToken,
		tokenIn: 'query',
		minimalHeaders: true
	});
}

/** Build a transcoded artwork URL for an `<img>` (token must be a query param — img can't send headers). */
export function artUrl(thumb: string | null | undefined, w: number, h: number = w): string | null {
	const active = session.active;
	if (!thumb || !active) return null;
	const params = new URLSearchParams({
		url: thumb,
		width: String(Math.round(w)),
		height: String(Math.round(h)),
		minSize: '1',
		upscale: '1',
		'X-Plex-Token': active.accessToken
	});
	return `${active.baseUri}/photo/:/transcode?${params.toString()}`;
}
