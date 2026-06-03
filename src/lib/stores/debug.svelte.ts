// Debug store — the only diagnostic channel in the car (no DevTools). A ring buffer of the
// last N network calls + a breadcrumb of events. Mutated by client.ts (logCall) from plain TS.

import { MAX_LOG } from '$lib/plex/config';

export interface NetLog {
	id: number;
	t: number;
	method: string;
	url: string; // token already masked by client.ts
	status: number | null;
	ms: number | null;
	ok: boolean;
	error?: string;
}

export interface DebugEvent {
	t: number;
	msg: string;
}

let seq = 0;

// Module-level runes state: import `debug` anywhere and mutate its properties (never reassign).
export const debug = $state({
	visible: false,
	calls: [] as NetLog[], // newest-first
	events: [] as DebugEvent[] // newest-first
});

export function logCall(entry: Omit<NetLog, 'id'>): void {
	debug.calls.unshift({ id: ++seq, ...entry });
	if (debug.calls.length > MAX_LOG) debug.calls.length = MAX_LOG;
}

export function logEvent(msg: string): void {
	debug.events.unshift({ t: Date.now(), msg });
	if (debug.events.length > MAX_LOG) debug.events.length = MAX_LOG;
}

export function toggleDebug(): void {
	debug.visible = !debug.visible;
}
