// Crash-safe, namespaced localStorage. The car browser may run in a private/quota-limited
// context; every access is guarded and degrades to an in-memory Map rather than throwing.

import { STORAGE_PREFIX } from './config';
import type { ActiveConnection, PlexAccount } from './types';

const memory = new Map<string, string>();
let available: boolean | null = null;

function lsAvailable(): boolean {
	if (available !== null) return available;
	try {
		const probe = STORAGE_PREFIX + '__probe';
		localStorage.setItem(probe, '1');
		localStorage.removeItem(probe);
		available = true;
	} catch {
		available = false;
	}
	return available;
}

function rawGet(key: string): string | null {
	if (lsAvailable()) {
		try {
			return localStorage.getItem(key);
		} catch {
			/* fall through to memory */
		}
	}
	return memory.has(key) ? (memory.get(key) ?? null) : null;
}

function rawSet(key: string, value: string): void {
	if (lsAvailable()) {
		try {
			localStorage.setItem(key, value);
			return;
		} catch {
			/* fall through to memory */
		}
	}
	memory.set(key, value);
}

function rawRemove(key: string): void {
	if (lsAvailable()) {
		try {
			localStorage.removeItem(key);
		} catch {
			/* ignore */
		}
	}
	memory.delete(key);
}

export function readJSON<T>(key: string, fallback: T): T {
	const raw = rawGet(key);
	if (raw == null) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

export function writeJSON<T>(key: string, value: T): void {
	try {
		rawSet(key, JSON.stringify(value));
	} catch {
		/* ignore — never throw on persistence */
	}
}

export function remove(key: string): void {
	rawRemove(key);
}

/** Wipe every Cabin key (prefix scan), both backends. */
export function clearAll(): void {
	if (lsAvailable()) {
		try {
			const keys: string[] = [];
			for (let i = 0; i < localStorage.length; i++) {
				const k = localStorage.key(i);
				if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
			}
			for (const k of keys) localStorage.removeItem(k);
		} catch {
			/* ignore */
		}
	}
	for (const k of [...memory.keys()]) if (k.startsWith(STORAGE_PREFIX)) memory.delete(k);
}

const K = {
	clientId: STORAGE_PREFIX + 'clientId',
	token: STORAGE_PREFIX + 'token',
	conn: STORAGE_PREFIX + 'conn',
	account: STORAGE_PREFIX + 'account'
} as const;

export const ClientIdStore = {
	get: (): string | null => readJSON<string | null>(K.clientId, null),
	set: (v: string): void => writeJSON(K.clientId, v),
	clear: (): void => remove(K.clientId)
};

export const TokenStore = {
	get: (): string | null => readJSON<string | null>(K.token, null),
	set: (v: string): void => writeJSON(K.token, v),
	clear: (): void => remove(K.token)
};

export const ConnStore = {
	get: (): ActiveConnection | null => readJSON<ActiveConnection | null>(K.conn, null),
	set: (v: ActiveConnection): void => writeJSON(K.conn, v),
	clear: (): void => remove(K.conn)
};

export const AccountStore = {
	get: (): PlexAccount | null => readJSON<PlexAccount | null>(K.account, null),
	set: (v: PlexAccount): void => writeJSON(K.account, v),
	clear: (): void => remove(K.account)
};
