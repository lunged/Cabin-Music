// Theme store — "auto" (follow the car's day/night via prefers-color-scheme), "light", or "dark".
// The resolved theme is applied as <html data-theme="…"> (also done pre-paint in app.html).

import { readJSON, writeJSON } from '$lib/plex/storage';
import { STORAGE_PREFIX } from '$lib/plex/config';

export type ThemeChoice = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const KEY = STORAGE_PREFIX + 'theme';

function loadChoice(): ThemeChoice {
	const v = readJSON<ThemeChoice>(KEY, 'auto');
	return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto';
}

export const theme = $state({
	choice: loadChoice(),
	resolved: 'dark' as ResolvedTheme
});

function systemPrefersLight(): boolean {
	return (
		typeof window !== 'undefined' &&
		!!window.matchMedia &&
		window.matchMedia('(prefers-color-scheme: light)').matches
	);
}

function resolve(choice: ThemeChoice): ResolvedTheme {
	if (choice === 'light' || choice === 'dark') return choice;
	return systemPrefersLight() ? 'light' : 'dark';
}

function apply(): void {
	const r = resolve(theme.choice);
	theme.resolved = r;
	if (typeof document !== 'undefined') {
		document.documentElement.dataset.theme = r;
		const meta = document.querySelector('meta[name="theme-color"]');
		if (meta) meta.setAttribute('content', r === 'light' ? '#eceef2' : '#16181d');
	}
}

export function setTheme(choice: ThemeChoice): void {
	theme.choice = choice;
	writeJSON(KEY, choice);
	apply();
}

export function cycleTheme(): void {
	const order: ThemeChoice[] = ['auto', 'light', 'dark'];
	setTheme(order[(order.indexOf(theme.choice) + 1) % order.length]);
}

let listening = false;

/** Apply the current theme and (once) start following system day/night changes while in "auto". */
export function initTheme(): void {
	apply();
	if (listening || typeof window === 'undefined' || !window.matchMedia) return;
	listening = true;
	const mq = window.matchMedia('(prefers-color-scheme: light)');
	const onChange = () => {
		if (theme.choice === 'auto') apply();
	};
	if (mq.addEventListener) mq.addEventListener('change', onChange);
}
