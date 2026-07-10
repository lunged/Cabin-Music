// Access-gate network calls (the optional Worker passphrase gate). These talk to the same-origin
// Worker route, NOT to Plex, so they use a plain fetch (no token, no plexFetch machinery). The gate
// route only exists in the deployed Worker; in local `npm run dev` there is no /auth (checkGate
// short-circuits), and in `npm run preview` (also a PROD build) /auth returns the SPA fallback HTML,
// which fails the JSON parse and falls through to the fail-open default below — harmless.

import { PLEX_AUTH_PATH, PROBE_TIMEOUT_MS } from './config';

export interface GateStatus {
	/** The Worker has a passphrase configured. */
	enabled: boolean;
	/** This browser already holds a valid cookie (or the gate is disabled). */
	authed: boolean;
}

/** Ask the Worker whether a passphrase is required and whether we're already unlocked.
 *  Fails OPEN (assume no gate) on ANY error, timeout, or non-JSON response — enforcement lives in the
 *  Worker regardless, so the worst case is the SPA boots and a /plex 401 (cabin-locked) re-triggers
 *  the gate (see media.ts). The timeout matters: on a cold car boot the browser can start before
 *  connectivity is up, and a stalled socket would otherwise hang the whole app on the boot spinner. */
export async function fetchGateStatus(signal?: AbortSignal): Promise<GateStatus> {
	// Combine a short timeout with the optional caller signal (AbortSignal.timeout post-dates the
	// car's Chromium ~109, so build it by hand — same pattern as plexFetch).
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
	const onAbort = () => controller.abort();
	if (signal) {
		if (signal.aborted) controller.abort();
		else signal.addEventListener('abort', onAbort, { once: true });
	}
	try {
		const res = await fetch(PLEX_AUTH_PATH, {
			method: 'GET',
			credentials: 'same-origin',
			headers: { Accept: 'application/json' },
			signal: controller.signal
		});
		if (!res.ok) return { enabled: false, authed: true };
		const data = (await res.json()) as Partial<GateStatus>;
		return { enabled: !!data.enabled, authed: !!data.authed };
	} catch {
		return { enabled: false, authed: true };
	} finally {
		clearTimeout(timer);
		if (signal) signal.removeEventListener('abort', onAbort);
	}
}

/** Submit the passphrase. On success the Worker sets the HttpOnly cookie; returns whether it matched. */
export async function postPassphrase(passphrase: string, signal?: AbortSignal): Promise<boolean> {
	const res = await fetch(PLEX_AUTH_PATH, {
		method: 'POST',
		credentials: 'same-origin',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({ passphrase }),
		signal
	});
	if (!res.ok) return false;
	const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
	return !!data.ok;
}
