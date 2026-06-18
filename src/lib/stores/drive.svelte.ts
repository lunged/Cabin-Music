// Driver-side preference: 'lhd' (left-hand drive — US default) or 'rhd' (right-hand drive). RHD
// mirrors the reachability-driven UI (nav rail side + Now Playing corner buttons) to the side nearest
// the driver; universal controls (prev/play/next order) are left unchanged. Applied as
// <html data-drive="…"> (also pre-painted in app.html to avoid a flash). Persisted to cabin.drive.

import { readJSON, writeJSON } from '$lib/plex/storage';
import { STORAGE_PREFIX } from '$lib/plex/config';

export type Drive = 'lhd' | 'rhd';

const KEY = STORAGE_PREFIX + 'drive';

function loadDrive(): Drive {
	return readJSON<Drive>(KEY, 'lhd') === 'rhd' ? 'rhd' : 'lhd';
}

export const drive = $state({ side: loadDrive() });

function apply(): void {
	if (typeof document !== 'undefined') document.documentElement.dataset.drive = drive.side;
}

export function setDrive(side: Drive): void {
	drive.side = side;
	writeJSON(KEY, side);
	apply();
}

/** Apply the saved side on boot (app.html pre-paints it too). */
export function initDrive(): void {
	apply();
}
