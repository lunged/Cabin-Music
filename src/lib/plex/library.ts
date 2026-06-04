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
			items: Array.isArray(h.Metadata) ? (h.Metadata as Metadata[]) : []
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

/** Home hub rows for a section (Recently Added, Recently Played, Mixes, On This Day, …). */
export async function getHubs(sectionId: string, count = 12, signal?: AbortSignal): Promise<Hub[]> {
	const data = await serverFetch<any>(`/hubs/sections/${sectionId}`, {
		query: { count, excludeFields: 'summary' },
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
