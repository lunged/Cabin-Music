// Audio streaming-quality preference. 'original' = lossless direct play of the source file (the
// default); the capped tiers transcode to MP3 at a fixed bitrate to save bandwidth on relay/cellular.
// Persisted to cabin.quality.

import { readJSON, writeJSON } from '$lib/plex/storage';
import { STORAGE_PREFIX } from '$lib/plex/config';

export type Quality = 'original' | 'high' | 'medium' | 'low';

/** Target MP3 bitrate (kbps) for each capped tier; 'original' streams the source untouched. */
export const QUALITY_KBPS: Record<Exclude<Quality, 'original'>, number> = {
	high: 320,
	medium: 192,
	low: 128
};

/** Labels for the Settings UI. */
export const QUALITY_LABEL: Record<Quality, string> = {
	original: 'Original',
	high: 'High',
	medium: 'Medium',
	low: 'Low'
};

const KEY = STORAGE_PREFIX + 'quality';
const CHOICES: Quality[] = ['original', 'high', 'medium', 'low'];

function loadChoice(): Quality {
	const v = readJSON<Quality>(KEY, 'original');
	return CHOICES.includes(v) ? v : 'original';
}

export const quality = $state({ choice: loadChoice() });

export function setQuality(c: Quality): void {
	quality.choice = c;
	writeJSON(KEY, c);
}

/** Target bitrate (kbps) for the current choice, or null for original/lossless (direct play). */
export function bitrateFor(): number | null {
	return quality.choice === 'original' ? null : QUALITY_KBPS[quality.choice];
}
