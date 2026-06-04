// Play queues + radio stations (for "Mixes for you" endless artist radio) and timeline reporting.

import { serverFetch } from './media';
import { session } from '$lib/stores/session.svelte';
import type { Metadata } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

function container(data: any): any {
	return data?.MediaContainer ?? {};
}
function metas(c: any): Metadata[] {
	return Array.isArray(c.Metadata) ? c.Metadata : [];
}

export interface PlayQueue {
	playQueueID: number;
	items: Metadata[];
	lastItemID: number | null; // playQueueItemID of the last item (for paging radio)
}

function readQueue(c: any): PlayQueue {
	const items = metas(c);
	const last = items.length ? items[items.length - 1] : null;
	return {
		playQueueID: c.playQueueID,
		items,
		lastItemID: last?.playQueueItemID ?? null
	};
}

/** `server://{machineId}/com.plexapp.plugins.library{key}` — the uri form /playQueues expects. */
export function stationUri(key: string): string {
	const machineId = session.active?.machineId ?? '';
	return `server://${machineId}/com.plexapp.plugins.library${key}`;
}

/** An artist's radio station key (requires ?includeStations=1). */
export async function getArtistStationKey(
	artistRatingKey: string,
	signal?: AbortSignal
): Promise<string | null> {
	const data = await serverFetch<any>(`/library/metadata/${artistRatingKey}`, {
		query: { includeStations: 1 },
		signal
	});
	const artist = metas(container(data))[0] as any;
	const stations = artist?.Stations;
	const stationMeta = stations?.[0]?.Metadata?.[0] ?? stations?.Metadata?.[0];
	return stationMeta?.key ?? null;
}

/** Resolve a "Mixes for you" hub item to a station key (best-effort across server shapes). */
export async function resolveMixStationKey(
	item: Metadata,
	signal?: AbortSignal
): Promise<string | null> {
	const key = item.key ?? '';
	if (/\/station\b/.test(key)) return key; // item already IS a station
	const m = key.match(/\/library\/metadata\/(\d+)/);
	const artistKey =
		m?.[1] ??
		item.grandparentRatingKey ??
		item.parentRatingKey ??
		(item.type === 'artist' ? item.ratingKey : undefined);
	if (artistKey) return getArtistStationKey(artistKey, signal);
	return null;
}

export async function createPlayQueue(
	uri: string,
	opts: { continuous?: boolean; shuffle?: boolean } = {},
	signal?: AbortSignal
): Promise<PlayQueue> {
	const data = await serverFetch<any>('/playQueues', {
		method: 'POST',
		query: {
			type: 'audio',
			uri,
			continuous: opts.continuous ? 1 : 0,
			shuffle: opts.shuffle ? 1 : 0,
			repeat: 0
		},
		signal
	});
	return readQueue(container(data));
}

/** Fetch a look-ahead window of a (radio) play queue to extend it. */
export async function pagePlayQueue(
	playQueueID: number,
	centerItemID: number,
	signal?: AbortSignal
): Promise<PlayQueue> {
	const data = await serverFetch<any>(`/playQueues/${playQueueID}`, {
		query: { window: 50, center: centerItemID, includeBefore: 0, includeAfter: 1 },
		signal
	});
	return readQueue(container(data));
}

/** Best-effort progress report (updates "recently played" + resume points). Never throws. */
export async function reportTimeline(
	ratingKey: string,
	state: 'playing' | 'paused' | 'stopped',
	timeMs: number,
	durationMs: number
): Promise<void> {
	try {
		await serverFetch('/:/timeline', {
			method: 'POST',
			query: {
				ratingKey,
				key: `/library/metadata/${ratingKey}`,
				state,
				time: Math.round(timeMs),
				duration: Math.round(durationMs)
			}
		});
	} catch {
		/* history reporting is non-critical */
	}
}
