// Display size: one multiplier for the UI. Layout lengths are rem, so scaling the root font-size
// scales them; vw/vh lengths are left alone on purpose (browser zoom never changed their physical
// size), so this behaves like the browser zoom the car doesn't let you adjust.
// Why it exists: Tesla 2026.26 raised the browser's devicePixelRatio 1.0 → ~1.53 (no user control),
// inflating every px/rem length. Applied as <html style="font-size: N%"> (also pre-painted in
// app.html). Persisted to cabin.scale.
// Not CSS `zoom` / `transform: scale()`: both also scale vw/dvh (the 100dvh shells stop filling
// the screen and the vw clamps over-shrink), and transform re-anchors the fixed Now Playing overlay.

import { readJSON, writeJSON } from '$lib/plex/storage';
import { STORAGE_PREFIX } from '$lib/plex/config';

const KEY = STORAGE_PREFIX + 'scale';

// Keep the default + accepted range in sync with the pre-paint script in src/app.html.
// Default ≈ 1/1.53 (Model 3/Y; S/X measure 1/1.56): restores the pre-2026.26 look on the car.
// ponytail: one fixed default for every browser — the car has no UA token to detect any more and
// dpr alone can't tell zoom from a HiDPI screen. Desktop/older firmware: pick 100% once in Settings.
export const SCALE_DEFAULT = 0.65;
export const SCALES = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.9, 1];

function loadScale(): number {
	const saved = readJSON<number>(KEY, SCALE_DEFAULT);
	return SCALES.includes(saved) ? saved : SCALE_DEFAULT;
}

export const scale = $state({ value: loadScale() });

function apply(): void {
	if (typeof document !== 'undefined') {
		document.documentElement.style.fontSize = scale.value * 100 + '%';
	}
}

export function setScale(value: number): void {
	scale.value = value;
	writeJSON(KEY, value);
	apply();
}

/** Apply the saved scale on boot (app.html pre-paints it too). */
export function initScale(): void {
	apply();
}
