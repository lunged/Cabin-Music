// Server + connection discovery (spec §5), plus the boot/reconnect sequence.

import { PLEX_TV_BASE, PROBE_TIMEOUT_MS, RESOURCES_TIMEOUT_MS } from './config';
import { plexFetch, PlexError } from './client';
import { getClientId } from './identifiers';
import { TokenStore, ConnStore, AccountStore } from './storage';
import type { ActiveConnection, ConnType, Identity, PlexConnection, PlexDevice, PlexAccount } from './types';
import { session, setStatus, fail, reset } from '$lib/stores/session.svelte';
import { logEvent } from '$lib/stores/debug.svelte';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** /resources is returned as a JSON array in v2, but tolerate the older MediaContainer/PascalCase
 *  shape too — we can't re-test the live response here, so parse defensively. */
function normalizeDevices(raw: unknown): PlexDevice[] {
	let list: any[] = [];
	if (Array.isArray(raw)) list = raw;
	else if (raw && typeof raw === 'object') {
		const obj = raw as any;
		if (Array.isArray(obj.Device)) list = obj.Device;
		else if (obj.MediaContainer && Array.isArray(obj.MediaContainer.Device)) list = obj.MediaContainer.Device;
	}
	const truthy = (v: unknown) => v === true || v === 1 || v === '1';
	return list.map((d: any) => {
		const connRaw: any[] = Array.isArray(d.connections)
			? d.connections
			: Array.isArray(d.Connection)
				? d.Connection
				: [];
		const connections: PlexConnection[] = connRaw.map((c: any) => ({
			protocol: c.protocol ?? '',
			address: c.address ?? '',
			port: Number(c.port ?? 0),
			uri: c.uri ?? '',
			local: truthy(c.local),
			relay: truthy(c.relay)
		}));
		return {
			name: d.name ?? 'Plex Server',
			clientIdentifier: d.clientIdentifier ?? '',
			provides: d.provides ?? '',
			owned: truthy(d.owned),
			accessToken: d.accessToken ?? undefined,
			connections
		} satisfies PlexDevice;
	});
}

export async function fetchResources(token: string, signal?: AbortSignal): Promise<PlexDevice[]> {
	const raw = await plexFetch<unknown>('/resources', {
		base: PLEX_TV_BASE,
		token,
		query: { includeHttps: 1, includeRelay: 1 },
		timeoutMs: RESOURCES_TIMEOUT_MS,
		signal
	});
	return normalizeDevices(raw);
}

function connTypeOf(c: PlexConnection): ConnType {
	if (c.relay) return 'relay';
	if (c.local) return 'local';
	return 'remote';
}

/** local → remote (plex.direct HTTPS) → relay. */
export function rankConnections(d: PlexDevice): PlexConnection[] {
	const order: Record<ConnType, number> = { local: 0, remote: 1, relay: 2 };
	return [...d.connections]
		.filter((c) => c.uri)
		.sort((a, b) => order[connTypeOf(a)] - order[connTypeOf(b)]);
}

/** Token-less reachability probe. Minimal headers → no CORS preflight. Null = unreachable. */
export async function probeIdentity(baseUri: string, signal?: AbortSignal): Promise<Identity | null> {
	try {
		const raw = await plexFetch<any>('/identity', {
			base: baseUri,
			minimalHeaders: true,
			timeoutMs: PROBE_TIMEOUT_MS,
			signal
		});
		const mc = raw?.MediaContainer ?? raw;
		const machineIdentifier: string | undefined = mc?.machineIdentifier;
		if (!machineIdentifier) return null;
		return { machineIdentifier, version: mc?.version };
	} catch {
		return null; // unreachable (network/CORS/timeout) — caller treats as "skip this connection"
	}
}

/** Probe a device's connections in rank order; first reachable (and matching machineId) wins. */
export async function pickConnection(d: PlexDevice, signal?: AbortSignal): Promise<ActiveConnection | null> {
	for (const c of rankConnections(d)) {
		if (signal?.aborted) return null;
		const type = connTypeOf(c);
		logEvent(`probing ${type}: ${c.uri}`);
		const id = await probeIdentity(c.uri, signal);
		if (id && (!d.clientIdentifier || id.machineIdentifier === d.clientIdentifier)) {
			return {
				baseUri: c.uri,
				serverName: d.name,
				machineId: id.machineIdentifier,
				accessToken: d.accessToken ?? '',
				connType: type
			};
		}
	}
	return null;
}

function isServer(d: PlexDevice): boolean {
	return d.provides
		.split(',')
		.map((s) => s.trim())
		.includes('server');
}

/** resources → owned media servers → first reachable connection. */
export async function discover(token: string, signal?: AbortSignal): Promise<ActiveConnection | null> {
	const devices = await fetchResources(token, signal);
	const owned = devices.filter((d) => isServer(d) && d.owned);
	const candidates = owned.length ? owned : devices.filter(isServer);
	session.candidates = candidates.map((d) => ({ name: d.name, machineId: d.clientIdentifier }));
	logEvent(`discovery: ${candidates.length} server(s)`);

	for (const d of candidates) {
		if (signal?.aborted) return null;
		const conn = await pickConnection(d, signal);
		if (conn) return conn;
	}
	return null;
}

/** Best-effort account info for display (username/avatar in the debug panel). Never blocks. */
export async function fetchAccount(token: string, signal?: AbortSignal): Promise<void> {
	try {
		const u = await plexFetch<any>('/user', { base: PLEX_TV_BASE, token, signal });
		const acct: PlexAccount = {
			id: u.id,
			uuid: u.uuid,
			username: u.username,
			title: u.title,
			email: u.email,
			thumb: u.thumb
		};
		session.account = acct;
		AccountStore.set(acct);
	} catch {
		/* non-fatal */
	}
}

let booting = false;

/** The boot/reconnect sequence. Called once on mount, and again right after pairing. */
export async function bootSession(signal?: AbortSignal): Promise<void> {
	if (booting) return;
	booting = true;
	try {
		setStatus('booting');
		getClientId(); // ensure a stable identifier exists

		const token = TokenStore.get();
		session.token = token;
		if (!token) {
			setStatus('unauthenticated');
			return;
		}
		session.account = AccountStore.get();
		void fetchAccount(token, signal); // best-effort, fire-and-forget
		setStatus('discovering');

		// Fast path: re-validate the cached connection with one cheap probe.
		const cached = ConnStore.get();
		if (cached) {
			logEvent(`fast-path: probing cached ${cached.connType} ${cached.baseUri}`);
			const id = await probeIdentity(cached.baseUri, signal);
			if (id && id.machineIdentifier === cached.machineId) {
				session.active = cached;
				setStatus('connected');
				logEvent('reconnected via cached connection');
				return;
			}
			logEvent('cached connection stale → full discovery');
		}

		// Full discovery.
		try {
			const conn = await discover(token, signal);
			if (conn) {
				session.active = conn;
				ConnStore.set(conn);
				setStatus('connected');
				logEvent(`connected: ${conn.serverName} (${conn.connType})`);
			} else if (session.candidates.length === 0) {
				fail(
					'discovering',
					'No Plex Media Server found on this account.',
					'Sign out and try a different Plex account.'
				);
			} else {
				fail(
					'discovering',
					`Found ${session.candidates.length} server(s), but none were reachable.`,
					`If this is the first run, add this app's address to Plex → Settings → Network → "List of allowed CORS origins": ${location.origin}`
				);
			}
		} catch (e) {
			if (e instanceof PlexError && e.status === 401) {
				// Token revoked/expired server-side → treat as signed out.
				TokenStore.clear();
				ConnStore.clear();
				AccountStore.clear();
				reset();
				logEvent('token rejected (401) → re-pair required');
				return;
			}
			const detail = e instanceof Error ? e.message : String(e);
			fail('discovering', 'Could not reach Plex to find your server.', detail);
		}
	} finally {
		booting = false;
	}
}
