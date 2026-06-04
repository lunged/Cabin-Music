// Helpers for talking to the active media server: a token-prefilled fetch and artwork URLs.
// Server calls use the token as a QUERY param + minimal headers → "simple" requests with no CORS
// preflight (most robust against per-server CORS config; the dev origin is allowlisted).

import { plexFetch, type PlexFetchOpts } from './client';
import { getClientId } from './identifiers';
import { session } from '$lib/stores/session.svelte';
import { bitrateFor } from '$lib/stores/quality.svelte';
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

/**
 * Transcoded MP3 stream via Plex's universal transcoder. `protocol=http` forces a single contiguous
 * MP3 (NOT HLS — the car's Chromium ~109 cannot play HLS without extra libraries). Pass a `bitrate`
 * (kbps) to cap quality (forces re-encode); omit it for the codec-compatibility fallback (remux only
 * when needed). Best-effort.
 */
export function transcodeUrl(track: Metadata | null | undefined, bitrate?: number): string | null {
	const active = session.active;
	if (!active || !track?.ratingKey) return null;
	const params = new URLSearchParams({
		path: `/library/metadata/${track.ratingKey}`,
		protocol: 'http',
		directPlay: '0',
		directStream: bitrate ? '0' : '1', // capped tier → force re-encode; fallback → allow remux
		audioCodec: 'mp3',
		'X-Plex-Client-Identifier': getClientId(),
		'X-Plex-Token': active.accessToken
	});
	if (bitrate) params.set('audioBitrate', String(bitrate));
	return `${active.baseUri}/music/:/transcode/universal/start.mp3?${params.toString()}`;
}

/**
 * Ordered list of URLs to try for a track, honoring the user's quality setting:
 *  - 'original' (lossless): direct play first, MP3 transcode as a codec fallback.
 *  - capped tier: the bitrate-limited transcode first, original as a fallback if it fails.
 * The player plays the first that works and advances down the list on an audio error.
 */
export function playbackCandidates(track: Metadata | null | undefined): string[] {
	const kbps = bitrateFor();
	const direct = streamUrl(track);
	if (kbps == null) {
		return [direct, transcodeUrl(track)].filter((u): u is string => !!u);
	}
	return [transcodeUrl(track, kbps), direct].filter((u): u is string => !!u);
}
