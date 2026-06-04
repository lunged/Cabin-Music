// Helpers for talking to the active media server: a token-prefilled fetch and artwork URLs.
// Server calls use the token as a QUERY param + minimal headers → "simple" requests with no CORS
// preflight (most robust against per-server CORS config; the dev origin is allowlisted).

import { plexFetch, type PlexFetchOpts } from './client';
import { getClientId } from './identifiers';
import { session } from '$lib/stores/session.svelte';
import type { Metadata } from './types';

type ServerOpts = Pick<PlexFetchOpts, 'query' | 'signal' | 'method' | 'timeoutMs'>;

export async function serverFetch<T>(path: string, opts: ServerOpts = {}): Promise<T> {
	const active = session.active;
	if (!active) throw new Error('Not connected to a server');
	return plexFetch<T>(path, {
		...opts,
		// Client identifier as a query param (kept out of headers so requests stay preflight-free).
		// Required by stateful endpoints like /playQueues, harmless elsewhere.
		query: { 'X-Plex-Client-Identifier': getClientId(), ...opts.query },
		base: active.baseUri,
		token: active.accessToken,
		tokenIn: 'query',
		minimalHeaders: true,
		// In production, route server JSON through the same-origin Worker proxy (no CORS dependency).
		// In dev, call plex.direct directly (Plex auto-allows localhost).
		viaProxy: import.meta.env.PROD
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

/** Direct-play stream URL for a track's first media part (token as query param for `<audio>`). */
export function streamUrl(track: Metadata | null | undefined): string | null {
	const active = session.active;
	const partKey = track?.Media?.[0]?.Part?.[0]?.key;
	if (!active || !partKey) return null;
	const sep = partKey.includes('?') ? '&' : '?';
	return `${active.baseUri}${partKey}${sep}X-Plex-Token=${encodeURIComponent(active.accessToken)}`;
}

/** Transcode fallback (MP3) for codecs the browser can't direct-play. Best-effort. */
export function transcodeUrl(track: Metadata | null | undefined): string | null {
	const active = session.active;
	if (!active || !track?.ratingKey) return null;
	const params = new URLSearchParams({
		path: `/library/metadata/${track.ratingKey}`,
		protocol: 'http',
		directPlay: '0',
		directStream: '1',
		audioCodec: 'mp3',
		'X-Plex-Token': active.accessToken
	});
	return `${active.baseUri}/music/:/transcode/universal/start.mp3?${params.toString()}`;
}
