// Access-gate store — the optional Worker passphrase gate that sits in FRONT of the whole app.
// Module-level runes state: mutate properties, never reassign the export.
//
// Flow: on boot the layout runs checkGate(); if the Worker requires a passphrase and this browser
// isn't unlocked, `required` is true and the layout shows <AccessGate> instead of anything else.
// A correct passphrase flips `required` false and the normal pair → discover → connect boot proceeds.

import { fetchGateStatus, postPassphrase } from '$lib/plex/gate';

export const gate = $state({
	/** The boot-time gate check has completed (or was skipped in dev). */
	checked: false,
	/** A passphrase is required and this browser is not yet unlocked. */
	required: false
});

/** Boot check. Dev has no Worker/gate, so it resolves immediately as "not required". */
export async function checkGate(signal?: AbortSignal): Promise<void> {
	if (!import.meta.env.PROD) {
		gate.required = false;
		gate.checked = true;
		return;
	}
	const status = await fetchGateStatus(signal);
	if (signal?.aborted) return;
	gate.required = status.enabled && !status.authed;
	gate.checked = true;
}

/** Submit the passphrase; on success clear `required` so the layout boots the session. */
export async function submitPassphrase(passphrase: string, signal?: AbortSignal): Promise<boolean> {
	const ok = await postPassphrase(passphrase, signal);
	if (ok) {
		gate.required = false;
		gate.checked = true;
	}
	return ok;
}

/** Safety net: if a server call 401s in production (cookie expired / secret rotated mid-session),
 *  re-lock so the passphrase screen reappears without a reload. */
export function requireGate(): void {
	gate.required = true;
	gate.checked = true;
}
