// Library browsing API (sections, hubs, artists/albums/tracks, playlists, search). All via serverFetch.

import { serverFetch } from './media';
import type { Hub, Metadata, PageResult, Section } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Plex `type` codes for the /all endpoint. */
export const TYPE = { artist: 8, album: 9, track: 10 } as const;

function container(data: any): any {
	return data?.MediaContainer ?? {};
}
function metas(c: any): Metadata[] {
	return Array.isArray(c.Metadata) ? c.Metadata : [];
}
function page(c: any, start: number): PageResult {
	return { items: metas(c), totalSize: c.totalSize ?? c.size ?? 0, offset: c.offset ?? start };
}
function mapHubs(c: any): Hub[] {
	const hubs: any[] = Array.isArray(c.Hub) ? c.Hub : [];
	return hubs
		.map((h) => ({
			hubIdentifier: h.hubIdentifier ?? '',
			title: h.title ?? '',
			type: h.type ?? '',
			size: h.size,
			more: h.more,
			// Items may arrive under Metadata[] OR Directory[] (mixes/stations use Directory) — check both.
			items: (Array.isArray(h.Metadata)
				? h.Metadata
				: Array.isArray(h.Directory)
					? h.Directory
					: []) as Metadata[]
		}))
		.filter((h) => h.items.length > 0);
}

/** Music library sections only (`type === 'artist'`). */
export async function getSections(signal?: AbortSignal): Promise<Section[]> {
	const data = await serverFetch<any>('/library/sections', { signal });
	const dirs: any[] = container(data).Directory ?? [];
	return dirs
		.filter((d) => d.type === 'artist')
		.map((d) => ({ key: String(d.key), type: d.type, title: d.title, uuid: d.uuid, thumb: d.thumb }));
}

/** Home hub rows for a section (Recently Added, Recently Played, Mixes, On This Day, …).
 *  `includeMyMixes` / `includeAnniversaryReleases` are OPT-IN — without them the server omits the
 *  "Mixes for You" and "On This Day" hubs entirely. includeStations/ExternalMedia=0 trims noise. */
export async function getHubs(sectionId: string, count = 12, signal?: AbortSignal): Promise<Hub[]> {
	const data = await serverFetch<any>(`/hubs/sections/${sectionId}`, {
		query: {
			count,
			includeStations: 0,
			includeExternalMedia: 0,
			includeMyMixes: 1,
			includeAnniversaryReleases: 1
		},
		signal
	});
	return mapHubs(container(data));
}

/** Paginated list of a section's artists(8)/albums(9)/tracks(10). */
export async function getAll(
	sectionId: string,
	opts: { type: number; start?: number; size?: number; sort?: string },
	signal?: AbortSignal
): Promise<PageResult> {
	const { type, start = 0, size = 60, sort = 'titleSort:asc' } = opts;
	const data = await serverFetch<any>(`/library/sections/${sectionId}/all`, {
		query: { type, sort, 'X-Plex-Container-Start': start, 'X-Plex-Container-Size': size },
		signal
	});
	return page(container(data), start);
}

/** Loved tracks (userRating = 10 / 5 stars) in a section — for the Home "Loved" row. */
export async function getLovedTracks(
	sectionId: string,
	opts: { size?: number } = {},
	signal?: AbortSignal
): Promise<PageResult> {
	const { size = 24 } = opts;
	const data = await serverFetch<any>(`/library/sections/${sectionId}/all`, {
		query: {
			type: TYPE.track,
			userRating: 10, // loved = 5 stars
			sort: 'lastViewedAt:desc',
			'X-Plex-Container-Start': 0,
			'X-Plex-Container-Size': size
		},
		signal
	});
	const res = page(container(data), 0);
	// Safety net in case a server ignores the filter — only show genuinely-loved tracks.
	res.items = res.items.filter((t) => (t.userRating ?? 0) >= 9.5);
	return res;
}

/** Children of an item: artist → albums, album → tracks. */
export async function getChildren(
	ratingKey: string,
	opts: { start?: number; size?: number; sort?: string } = {},
	signal?: AbortSignal
): Promise<PageResult> {
	const { start = 0, size = 200, sort } = opts;
	const query: Record<string, string | number> = {
		'X-Plex-Container-Start': start,
		'X-Plex-Container-Size': size
	};
	if (sort) query.sort = sort;
	const data = await serverFetch<any>(`/library/metadata/${ratingKey}/children`, { query, signal });
	return page(container(data), start);
}

/** A single item's metadata (for detail headers). */
export async function getMetadata(ratingKey: string, signal?: AbortSignal): Promise<Metadata | null> {
	const data = await serverFetch<any>(`/library/metadata/${ratingKey}`, { signal });
	return metas(container(data))[0] ?? null;
}

/** Audio playlists, most-recently-updated first. */
export async function getPlaylists(
	opts: { start?: number; size?: number } = {},
	signal?: AbortSignal
): Promise<PageResult> {
	const { start = 0, size = 60 } = opts;
	const data = await serverFetch<any>('/playlists', {
		query: {
			playlistType: 'audio',
			sort: 'updatedAt:desc',
			'X-Plex-Container-Start': start,
			'X-Plex-Container-Size': size
		},
		signal
	});
	return page(container(data), start);
}

export async function getPlaylistItems(
	id: string,
	opts: { start?: number; size?: number } = {},
	signal?: AbortSignal
): Promise<PageResult> {
	const { start = 0, size = 200 } = opts;
	const data = await serverFetch<any>(`/playlists/${id}/items`, {
		query: { 'X-Plex-Container-Start': start, 'X-Plex-Container-Size': size },
		signal
	});
	return page(container(data), start);
}

/** A single playlist's metadata (for the detail header). */
export async function getPlaylist(id: string, signal?: AbortSignal): Promise<Metadata | null> {
	const data = await serverFetch<any>(`/playlists/${id}`, { signal });
	return metas(container(data))[0] ?? null;
}

/** Fetch the tracks behind an item's own `key` (e.g. a mix/station/playlist content endpoint).
 *  Used to enrich "Mixes for you" tiles (artist image + included artists) and to play them. */
export async function getItemsByKey(
	key: string,
	opts: { size?: number } = {},
	signal?: AbortSignal
): Promise<Metadata[]> {
	const data = await serverFetch<any>(key, {
		query: { 'X-Plex-Container-Start': 0, 'X-Plex-Container-Size': opts.size ?? 60 },
		signal
	});
	return metas(container(data));
}

/** Find an artist by (approximate) name within a section — used to resolve a "{Artist} Mix" to its
 *  seed artist for correct art + artist-radio playback. Prefers an exact case-insensitive match. */
export async function findArtist(
	name: string,
	sectionId: string,
	signal?: AbortSignal
): Promise<Metadata | null> {
	const hubs = await search(name, sectionId, 8, signal);
	const artists = hubs.flatMap((h) => h.items).filter((i) => i.type === 'artist');
	const lower = name.toLowerCase();
	return artists.find((a) => a.title.toLowerCase() === lower) ?? artists[0] ?? null;
}

/** Grouped search (artists/albums/tracks/playlists), scoped to a section. */
export async function search(
	query: string,
	sectionId: string,
	limit = 12,
	signal?: AbortSignal
): Promise<Hub[]> {
	const data = await serverFetch<any>('/hubs/search', {
		query: { query, limit, sectionId },
		signal
	});
	return mapHubs(container(data));
}
