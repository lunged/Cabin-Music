// Stable per-device client identifier + the standard X-Plex-* headers.
// The identifier is generated ONCE and persists across sign-out — regenerating it would
// orphan the device entry in the user's Plex account and force re-authorization every time.

import { PLEX_PRODUCT, PLEX_VERSION } from './config';
import { ClientIdStore } from './storage';

let cached: string | null = null;

function uuid(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	// Fallback for non-secure contexts (a client identifier needn't be cryptographically strong).
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

export function getClientId(): string {
	if (cached) return cached;
	let id = ClientIdStore.get();
	if (!id) {
		id = uuid();
		ClientIdStore.set(id);
	}
	cached = id;
	return id;
}

/** Standard headers for plex.tv calls. Device fields make the entry readable in Plex's device list. */
export function plexHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		Accept: 'application/json',
		'X-Plex-Client-Identifier': getClientId(),
		'X-Plex-Product': PLEX_PRODUCT,
		'X-Plex-Version': PLEX_VERSION,
		'X-Plex-Device': 'Web',
		'X-Plex-Platform': 'Web',
		'X-Plex-Device-Name': PLEX_PRODUCT,
		...extra
	};
}
