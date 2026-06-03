// Plex PIN auth flow (spec §5). All calls go through plexFetch (debug-logged, masked).

import { PLEX_AUTH_APP, PLEX_PRODUCT, POLL_INTERVAL_MS } from './config';
import { getClientId } from './identifiers';
import { plexFetch } from './client';
import { TokenStore, ConnStore, AccountStore } from './storage';
import type { Pin } from './types';
import { session, reset } from '$lib/stores/session.svelte';
import { logEvent } from '$lib/stores/debug.svelte';

/** Create a PIN. Returns the id (for polling) and the short user-facing code.
 *  We deliberately DON'T request a "strong" PIN: strong returns a long (~25-char) code that's
 *  fine for the QR/app.plex.tv link but impossible to type. A normal PIN is a 4-char code that
 *  works in the QR flow AND is typeable at plex.tv/link — better for the car's no-keyboard goal. */
export async function createPin(signal?: AbortSignal): Promise<Pin> {
	return plexFetch<Pin>('/pins', { method: 'POST', signal });
}

/** Poll a PIN's current state. The client identifier header must match createPin (plexFetch handles it). */
export async function getPin(id: number, signal?: AbortSignal): Promise<Pin> {
	return plexFetch<Pin>(`/pins/${id}`, { method: 'GET', signal });
}

/** The URL the user opens on their phone to authorize. clientID MUST equal X-Plex-Client-Identifier.
 *  No `forwardUrl` — pairing happens on the phone; the car's poll loop detects authorization. */
export function buildAuthUrl(code: string): string {
	const parts = [
		`clientID=${encodeURIComponent(getClientId())}`,
		`code=${encodeURIComponent(code)}`,
		`context[device][product]=${encodeURIComponent(PLEX_PRODUCT)}`
	];
	return `${PLEX_AUTH_APP}#?${parts.join('&')}`;
}

/** Resolves/clears early when `signal` aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const done = () => {
			clearTimeout(timer);
			signal.removeEventListener('abort', done);
			resolve();
		};
		const timer = setTimeout(done, ms);
		signal.addEventListener('abort', done, { once: true });
	});
}

/** Poll until authorized, expired, or aborted. Survives transient network errors (backs off).
 *  The `code` does not rotate, so a blip never invalidates the pin — we just keep polling. */
export async function pollPin(
	pin: Pin,
	signal: AbortSignal,
	onToken: (token: string) => void
): Promise<'authorized' | 'expired' | 'aborted'> {
	const deadline = Date.parse(pin.expiresAt) || Date.now() + (pin.expiresIn || 900) * 1000;
	let errStreak = 0;

	while (!signal.aborted && Date.now() < deadline) {
		// Be polite while backgrounded; the deadline keeps ticking regardless.
		if (typeof document !== 'undefined' && document.hidden) {
			await sleep(1000, signal);
			continue;
		}
		try {
			const fresh = await getPin(pin.id, signal);
			if (fresh.authToken) {
				onToken(fresh.authToken);
				return 'authorized';
			}
			errStreak = 0;
			await sleep(POLL_INTERVAL_MS, signal);
		} catch {
			if (signal.aborted) return 'aborted';
			errStreak++;
			logEvent(`PIN poll error #${errStreak}`);
			await sleep(Math.min(1000 * 2 ** errStreak, 5000), signal);
		}
	}
	return signal.aborted ? 'aborted' : 'expired';
}

export function persistToken(token: string): void {
	TokenStore.set(token);
	session.token = token;
}

/** Sign out / switch account. Clears token + connection + account, KEEPS the client identifier. */
export function signOut(): void {
	TokenStore.clear();
	ConnStore.clear();
	AccountStore.clear();
	reset();
	logEvent('signed out');
}
