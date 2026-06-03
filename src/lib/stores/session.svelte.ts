// Session store — the state machine that gates the whole UI.
// Module-level runes state: mutate properties, never reassign the export.

import type { ActiveConnection, PlexAccount } from '$lib/plex/types';

export type SessionStatus =
	| 'booting' // reading storage, deciding where to go
	| 'unauthenticated' // no token → PairScreen
	| 'pairing' // PIN shown, polling
	| 'authenticated' // have token, not yet connected
	| 'discovering' // finding/probing the server
	| 'connected' // ready (Phase 2 takes over from here)
	| 'error';

export interface SessionError {
	stage: SessionStatus;
	message: string;
	detail?: string;
}

export interface ServerCandidate {
	name: string;
	machineId: string;
}

export const session = $state({
	status: 'booting' as SessionStatus,
	token: null as string | null, // account authToken
	account: null as PlexAccount | null,
	active: null as ActiveConnection | null,
	candidates: [] as ServerCandidate[], // reserved for a Phase 2 multi-server picker
	error: null as SessionError | null
});

export function setStatus(next: SessionStatus): void {
	session.status = next;
	if (next !== 'error') session.error = null;
}

export function fail(stage: SessionStatus, message: string, detail?: string): void {
	session.error = { stage, message, detail };
	session.status = 'error';
}

/** Sign-out / switch-account: clears identity-bound state, returns to pairing. Keeps clientId. */
export function reset(): void {
	session.token = null;
	session.account = null;
	session.active = null;
	session.candidates = [];
	session.error = null;
	session.status = 'unauthenticated';
}
