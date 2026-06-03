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
