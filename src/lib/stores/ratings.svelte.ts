// Loved/favorite state. Plex stores this as userRating (0–10); Cabin's "heart" = 10, clearing = -1.
// We keep optimistic overrides so the heart flips instantly on tap and survives navigation, then
// reconcile with the server's userRating on the next fetch.

import { rateItem } from '$lib/plex/media';
import type { Metadata } from '$lib/plex/types';
import { logEvent } from '$lib/stores/debug.svelte';

const LOVED = 9.5; // userRating threshold for "loved" (the heart sets exactly 10)

export const ratings = $state({ overrides: {} as Record<string, boolean> });

export function isLoved(item: Metadata | null | undefined): boolean {
	const rk = item?.ratingKey;
	if (!rk) return false;
	if (rk in ratings.overrides) return ratings.overrides[rk];
	return (item?.userRating ?? 0) >= LOVED;
}

export async function toggleLove(item: Metadata | null | undefined): Promise<void> {
	const rk = item?.ratingKey;
	if (!rk) return;
	const next = !isLoved(item);
	ratings.overrides[rk] = next; // optimistic
	try {
		await rateItem(rk, next ? 10 : -1);
	} catch (e) {
		ratings.overrides[rk] = !next; // revert on failure
		logEvent(`rate failed: ${(e as Error)?.message ?? e}`);
	}
}
