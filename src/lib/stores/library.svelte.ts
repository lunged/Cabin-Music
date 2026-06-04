// Active-library store. Single active music library at a time; persisted to cabin.library.

import { getSections } from '$lib/plex/library';
import { readJSON, writeJSON, remove } from '$lib/plex/storage';
import { STORAGE_PREFIX } from '$lib/plex/config';
import type { Section } from '$lib/plex/types';

const KEY = STORAGE_PREFIX + 'library';

export const library = $state({
	sections: [] as Section[],
	activeId: null as string | null,
	loaded: false,
	loading: false,
	error: null as string | null
});

export function activeSection(): Section | null {
	return library.sections.find((s) => s.key === library.activeId) ?? null;
}

/** Load the server's music sections and restore (or auto-pick) the active one. */
export async function loadSections(force = false): Promise<void> {
	if (library.loading) return;
	if (library.loaded && !force) return;
	library.loading = true;
	library.error = null;
	try {
		const sections = await getSections();
		library.sections = sections;
		const saved = readJSON<string | null>(KEY, null);
		if (saved && sections.some((s) => s.key === saved)) {
			library.activeId = saved; // restore previous choice
		} else if (sections.length === 1) {
			library.activeId = sections[0].key; // only one → auto-select
			writeJSON(KEY, library.activeId);
		} else {
			library.activeId = null; // multiple & no valid saved → needs the chooser
		}
		library.loaded = true;
	} catch (e) {
		library.error = e instanceof Error ? e.message : String(e);
	} finally {
		library.loading = false;
	}
}

export function setActive(id: string): void {
	library.activeId = id;
	writeJSON(KEY, id);
}

/** Called on sign-out so the next account reloads fresh. */
export function clearLibrary(): void {
	library.sections = [];
	library.activeId = null;
	library.loaded = false;
	library.error = null;
	remove(KEY);
}
