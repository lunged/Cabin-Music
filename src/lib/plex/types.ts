// Plex API shapes (the subset Cabin uses) plus Cabin's own connection model.

/** Response from POST /pins and GET /pins/{id}. */
export interface Pin {
	id: number;
	code: string;
	authToken: string | null;
	expiresIn: number;
	expiresAt: string;
}

/** One reachable address for a server, from /resources. */
export interface PlexConnection {
	protocol: string;
	address: string;
	port: number;
	uri: string;
	local: boolean;
	relay: boolean;
}

/** A device from /resources (we only care about media servers — `provides` contains "server"). */
export interface PlexDevice {
	name: string;
	clientIdentifier: string; // == the server's machineIdentifier
	provides: string;
	owned: boolean;
	accessToken?: string; // per-resource token; use this for the server's own API
	connections: PlexConnection[];
}

/** GET {server}/identity */
export interface Identity {
	machineIdentifier: string;
	version?: string;
}

/** GET plex.tv/api/v2/user — best-effort, for display only. */
export interface PlexAccount {
	id?: number;
	uuid?: string;
	username?: string;
	title?: string;
	email?: string;
	thumb?: string;
}

export type ConnType = 'local' | 'remote' | 'relay';

/** The connection Cabin actually uses + caches, after probing. */
export interface ActiveConnection {
	baseUri: string;
	serverName: string;
	machineId: string;
	accessToken: string;
	connType: ConnType;
}

/** A library section. Music sections have `type === 'artist'`. */
export interface Section {
	key: string;
	type: string;
	title: string;
	uuid?: string;
	thumb?: string;
}

/** A generic library item (artist/album/track/playlist) — the fields Cabin reads. */
export interface Metadata {
	ratingKey: string;
	key?: string;
	type: string; // 'artist' | 'album' | 'track' | 'playlist'
	title: string;
	parentTitle?: string; // album (for a track) / artist (for an album)
	grandparentTitle?: string; // artist (for a track)
	parentRatingKey?: string;
	grandparentRatingKey?: string;
	thumb?: string;
	parentThumb?: string;
	grandparentThumb?: string;
	composite?: string; // playlist/mix art grid
	art?: string; // background / fallback art
	index?: number; // track number
	year?: number;
	duration?: number; // ms
	leafCount?: number; // playlist/album track count
	childCount?: number;
	summary?: string; // description; Cabin also reuses this to carry a mix's included-artists list
	addedAt?: number;
	lastViewedAt?: number;
	userRating?: number; // 0–10 star rating; Cabin treats 10 as "loved" (heart)
	viewOffset?: number; // ms — server-side resume point ("where you left off")
	playQueueItemID?: number; // present on items returned from /playQueues
	Media?: { Part?: { key?: string }[] }[];
}

/** A home/search hub — a titled row of items. */
export interface Hub {
	hubIdentifier: string;
	title: string;
	type: string;
	size?: number;
	more?: boolean;
	items: Metadata[];
}

/** A paginated list response. */
export interface PageResult {
	items: Metadata[];
	totalSize: number;
	offset: number;
}
