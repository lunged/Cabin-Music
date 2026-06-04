// Playback engine: one HTMLAudioElement managed by a runes store. Albums/playlists become a
// client-side queue; "Mixes for you" radio (server play queue) is layered on in playback.ts (3b).

import type { Metadata } from '$lib/plex/types';
import { playbackCandidates, artUrl } from '$lib/plex/media';
import {
	getArtistStationKey,
	resolveMixStationKey,
	stationUri,
	createPlayQueue,
	pagePlayQueue,
	reportTimeline
} from '$lib/plex/playback';
import { readJSON, writeJSON } from '$lib/plex/storage';
import { STORAGE_PREFIX } from '$lib/plex/config';
import { logEvent } from '$lib/stores/debug.svelte';

const KEY = STORAGE_PREFIX + 'player';

export type Repeat = 'off' | 'all' | 'one';
export interface RadioState {
	playQueueID: number;
	lastItemID: number | null;
	artistKey: string;
}

export const player = $state({
	queue: [] as Metadata[],
	index: -1,
	playing: false,
	currentTime: 0,
	duration: 0,
	repeat: 'off' as Repeat,
	shuffle: false,
	expanded: false, // full-screen Now Playing open
	radio: null as RadioState | null
});

export function currentTrack(): Metadata | null {
	return player.index >= 0 && player.index < player.queue.length ? player.queue[player.index] : null;
}

// --- module-level, non-reactive ---
let base: Metadata[] = []; // original (pre-shuffle) order
// Two audio elements ping-pong so the NEXT track is buffered ahead of time (near-gapless): one
// plays while the other preloads, and on advance we swap to the already-buffered element.
let players: HTMLAudioElement[] = [];
let activeIdx = 0;
let prefetchIdx = -1; // queue index the INACTIVE element is currently primed with
let restored = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let candidates: string[] = []; // ordered playback URLs for the current track (quality + fallbacks)
let candidateIdx = 0;
let lastTimelineAt = 0;

/** The preferred (first) playback URL for a track, honoring the quality setting. */
function primaryUrl(t: Metadata): string | null {
	return playbackCandidates(t)[0] ?? null;
}

function rand(n: number): number {
	return Math.floor(Math.random() * n);
}
function shuffled<T>(arr: T[]): T[] {
	const a = arr.slice();
	for (let i = a.length - 1; i > 0; i--) {
		const j = rand(i + 1);
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

function attach(a: HTMLAudioElement) {
	// Events from the inactive (preloading) element are ignored — only the active one drives state.
	a.addEventListener('timeupdate', () => {
		if (a !== active()) return;
		player.currentTime = a.currentTime;
		persistSoon();
		maybeReportTimeline();
		maybePrime();
	});
	a.addEventListener('durationchange', () => {
		if (a !== active()) return;
		player.duration = Number.isFinite(a.duration) ? a.duration : 0;
	});
	a.addEventListener('play', () => {
		if (a !== active()) return;
		player.playing = true;
		reportNow('playing');
	});
	a.addEventListener('pause', () => {
		if (a !== active()) return;
		player.playing = false;
		reportNow('paused');
	});
	a.addEventListener('ended', () => {
		if (a !== active()) return;
		next(true);
	});
	a.addEventListener('error', () => {
		if (a !== active()) return;
		onError();
	});
}

function ensure(): HTMLAudioElement | null {
	if (typeof Audio === 'undefined') return null;
	if (players.length) return players[activeIdx];
	players = [new Audio(), new Audio()];
	for (const a of players) {
		a.preload = 'auto';
		attach(a);
	}
	setupMediaSessionHandlers();
	registerUnloadFlush();
	return players[activeIdx];
}
function el(): HTMLAudioElement | null {
	return ensure();
}
function active(): HTMLAudioElement | null {
	return players[activeIdx] ?? null;
}
function inactive(): HTMLAudioElement | null {
	return players.length ? players[activeIdx ^ 1] : null;
}

/** Index of the track to preload next (respecting repeat); -1 if there's nothing to prime. */
function nextIndexFor(i: number): number {
	if (player.repeat === 'one') return -1; // repeat-one just replays via seek(0)
	const n = i + 1;
	if (n < player.queue.length) return n;
	if (player.repeat === 'all' && player.queue.length) return 0;
	return -1;
}

/** Preload the given queue index into the INACTIVE element so the next advance is seamless. */
function prime(i: number) {
	prefetchIdx = -1;
	if (i < 0 || i >= player.queue.length || i === player.index) return;
	const t = player.queue[i];
	const url = t ? primaryUrl(t) : null;
	const pre = inactive();
	if (!url || !pre) return;
	if (pre.src !== url) {
		pre.src = url;
		pre.load();
	}
	prefetchIdx = i;
}
/** Prime the next track only as the current one nears its end (avoids doubling bandwidth all song). */
function maybePrime() {
	if (prefetchIdx !== -1) return;
	const dur = player.duration;
	if (!dur || dur - player.currentTime > 30) return;
	prime(nextIndexFor(player.index));
}
/** Invalidate the preloaded track after a queue change; maybePrime() re-primes near the next end. */
function reprime() {
	prefetchIdx = -1;
}

function load(track: Metadata, autoplay: boolean) {
	const a = ensure();
	if (!a) return;
	candidates = playbackCandidates(track);
	candidateIdx = 0;
	if (!candidates.length) {
		logEvent(`no playable url for "${track.title}"`);
		return;
	}
	a.src = candidates[0];
	a.load();
	setNowPlayingMetadata(track);
	if (autoplay) void a.play().catch((e: unknown) => logEvent(`play blocked: ${(e as Error)?.name ?? e}`));
}

function onError() {
	const a = active();
	const track = currentTrack();
	if (!a || !track) return;
	// Walk the fallback chain (e.g. transcode after a failed direct play, or vice-versa).
	candidateIdx++;
	if (candidateIdx < candidates.length) {
		logEvent(`playback fallback ${candidateIdx} for "${track.title}"`);
		a.src = candidates[candidateIdx];
		a.load();
		void a.play().catch(() => {});
		return;
	}
	logEvent(`playback failed for "${track.title}" — skipping`);
	next(true);
}

function goTo(i: number) {
	// Gapless path: the inactive element is already buffered with track i → swap to it.
	if (i === prefetchIdx && inactive()?.src) {
		const old = active();
		if (old) old.pause();
		activeIdx ^= 1;
		prefetchIdx = -1;
		player.index = i;
		const a = active();
		const t = currentTrack();
		if (a && t) {
			// The primed element holds candidates[0]; record the chain so onError can fall back.
			candidates = playbackCandidates(t);
			candidateIdx = 0;
			a.currentTime = 0;
			player.currentTime = 0;
			player.duration = Number.isFinite(a.duration) ? a.duration : 0;
			setNowPlayingMetadata(t);
			void a.play().catch((e: unknown) => logEvent(`play blocked: ${(e as Error)?.name ?? e}`));
		}
		persist();
		return;
	}
	player.index = i;
	const t = currentTrack();
	if (t) load(t, true);
	persist();
}

// --- public actions ---

/** Play a list of tracks starting at startIndex. opts.radio marks a continuous (radio) queue. */
export function playList(
	tracks: Metadata[],
	startIndex = 0,
	opts: { radio?: RadioState; shuffle?: boolean } = {}
): void {
	if (!tracks.length) return;
	if (typeof opts.shuffle === 'boolean') player.shuffle = opts.shuffle;
	base = tracks.slice();
	const start = Math.max(0, Math.min(startIndex, tracks.length - 1));
	player.radio = opts.radio ?? null;
	if (player.shuffle && !opts.radio) {
		const cur = tracks[start];
		player.queue = [cur, ...shuffled(tracks.filter((_, i) => i !== start))];
		player.index = 0;
	} else {
		player.queue = tracks.slice();
		player.index = start;
	}
	const t = currentTrack();
	if (t) load(t, true);
	persist();
}

/** Append more tracks to the queue (used by radio paging in 3b). */
export function appendToQueue(tracks: Metadata[]): void {
	if (!tracks.length) return;
	player.queue = [...player.queue, ...tracks];
	base = [...base, ...tracks];
	reprime();
}

export function toggle(): void {
	const a = el();
	if (!a) return;
	if (player.playing) a.pause();
	else void a.play().catch((e: unknown) => logEvent(`play blocked: ${(e as Error)?.name ?? e}`));
}

export function next(auto = false): void {
	if (!player.queue.length) return;
	if (auto && player.repeat === 'one') {
		seek(0);
		void el()?.play().catch(() => {});
		return;
	}
	// Radio: top up the queue before it drains.
	if (player.radio && player.index >= player.queue.length - 5) void extendRadio();
	let i = player.index + 1;
	if (i >= player.queue.length) {
		if (player.repeat === 'all') i = 0;
		else {
			// End of queue. (Radio extension is wired in 3b via appendToQueue.)
			player.playing = false;
			persist();
			return;
		}
	}
	goTo(i);
}

export function prev(): void {
	if (!player.queue.length) return;
	if (player.currentTime > 3) {
		seek(0);
		return;
	}
	let i = player.index - 1;
	if (i < 0) i = player.repeat === 'all' ? player.queue.length - 1 : 0;
	goTo(i);
}

export function seek(t: number): void {
	const a = el();
	if (a) {
		a.currentTime = t;
		player.currentTime = t;
		reportNow(player.playing ? 'playing' : 'paused');
	}
}

export function cycleRepeat(): void {
	player.repeat = player.repeat === 'off' ? 'all' : player.repeat === 'all' ? 'one' : 'off';
	persist();
}

export function toggleShuffle(): void {
	const cur = currentTrack();
	player.shuffle = !player.shuffle;
	if (player.shuffle) {
		const rest = shuffled(base.filter((t) => t !== cur));
		player.queue = cur ? [cur, ...rest] : rest;
		player.index = cur ? 0 : -1;
	} else {
		player.queue = base.slice();
		player.index = cur ? base.indexOf(cur) : -1;
	}
	reprime();
	persist();
}

export function toggleExpanded(): void {
	player.expanded = !player.expanded;
}

/** Drop the preloaded next track (e.g. after a quality change) so it re-primes at the new setting. */
export function invalidatePrefetch(): void {
	reprime();
}

// --- queue management (view / reorder / play-next / remove) ---

/** Jump to a specific queue index and play it. */
export function jumpTo(i: number): void {
	if (i < 0 || i >= player.queue.length) return;
	goTo(i);
}

/** Insert a track to play right after the current one. */
export function enqueueNext(track: Metadata): void {
	if (player.index < 0 || !player.queue.length) {
		playList([track], 0);
		return;
	}
	const q = player.queue.slice();
	q.splice(player.index + 1, 0, track);
	player.queue = q;
	base = q.slice();
	reprime();
	persist();
}

/** Add a track to the end of the queue. */
export function enqueueLast(track: Metadata): void {
	if (player.index < 0 || !player.queue.length) {
		playList([track], 0);
		return;
	}
	player.queue = [...player.queue, track];
	base = player.queue.slice();
	reprime();
	persist();
}

/** Remove the queue item at i, adjusting the current index / playback as needed. */
export function removeAt(i: number): void {
	if (i < 0 || i >= player.queue.length) return;
	const wasPlaying = player.playing;
	const q = player.queue.slice();
	q.splice(i, 1);
	if (q.length === 0) {
		player.queue = [];
		base = [];
		player.index = -1;
		prefetchIdx = -1;
		const a = active();
		if (a) {
			a.pause();
			a.removeAttribute('src');
			a.load();
		}
		player.playing = false;
		player.currentTime = 0;
		player.duration = 0;
		persist();
		return;
	}
	player.queue = q;
	base = q.slice();
	if (i < player.index) {
		player.index -= 1;
		reprime();
	} else if (i === player.index) {
		// Removed the now-playing track → play whatever shifts into its slot.
		player.index = Math.min(player.index, q.length - 1);
		const t = currentTrack();
		if (t) load(t, wasPlaying);
	} else {
		reprime();
	}
	persist();
}

/** Reorder the queue (▲▼), keeping the currently-playing track selected. */
export function moveQueueItem(from: number, to: number): void {
	const n = player.queue.length;
	if (from < 0 || from >= n || to < 0 || to >= n || from === to) return;
	const q = player.queue.slice();
	const [item] = q.splice(from, 1);
	q.splice(to, 0, item);
	player.queue = q;
	base = q.slice();
	if (from === player.index) player.index = to;
	else if (from < player.index && to >= player.index) player.index -= 1;
	else if (from > player.index && to <= player.index) player.index += 1;
	reprime();
	persist();
}

// --- Media Session (best-effort) ---
function setupMediaSessionHandlers() {
	if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
	const ms = navigator.mediaSession;
	try {
		ms.setActionHandler('play', () => toggle());
		ms.setActionHandler('pause', () => toggle());
		ms.setActionHandler('nexttrack', () => next());
		ms.setActionHandler('previoustrack', () => prev());
		ms.setActionHandler('seekto', (d: MediaSessionActionDetails) => {
			if (typeof d.seekTime === 'number') seek(d.seekTime);
		});
	} catch {
		/* some actions unsupported — ignore */
	}
}

function setNowPlayingMetadata(track: Metadata) {
	const artist = track.grandparentTitle ?? '';
	const album = track.parentTitle ?? '';
	// Some car browsers (incl. Tesla) surface document.title in the native now-playing widget,
	// falling back to the hostname when it's blank — so put the track + artist there too.
	if (typeof document !== 'undefined') {
		document.title = artist ? `${track.title} — ${artist}` : track.title || 'Cabin Music';
	}
	if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined')
		return;
	const art = artUrl(track.parentThumb ?? track.thumb ?? track.grandparentThumb, 300);
	navigator.mediaSession.metadata = new MediaMetadata({
		title: track.title,
		artist,
		album,
		artwork: art ? [{ src: art, sizes: '300x300', type: 'image/jpeg' }] : []
	});
}

// --- timeline reporting (keeps Plex "recently played" + resume points / viewOffset current) ---
function reportNow(state: 'playing' | 'paused' | 'stopped') {
	const t = currentTrack();
	if (!t?.ratingKey) return;
	lastTimelineAt = Date.now();
	void reportTimeline(t.ratingKey, state, player.currentTime * 1000, (player.duration || 0) * 1000);
}
function maybeReportTimeline() {
	if (!player.playing) return;
	if (Date.now() - lastTimelineAt < 10000) return;
	reportNow('playing');
}

// Flush position + a final timeline report when the tab is hidden/closed, so reopening (here or in
// another Plex client) resumes where you left off.
let unloadBound = false;
function registerUnloadFlush() {
	if (unloadBound || typeof window === 'undefined') return;
	unloadBound = true;
	const flush = () => {
		persist();
		reportNow('paused');
	};
	window.addEventListener('pagehide', flush);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') flush();
	});
}

// --- persistence ---
function persist() {
	writeJSON(KEY, {
		queue: player.queue,
		index: player.index,
		time: player.currentTime,
		repeat: player.repeat,
		shuffle: player.shuffle
	});
}
function persistSoon() {
	if (persistTimer) return;
	persistTimer = setTimeout(() => {
		persistTimer = null;
		persist();
	}, 4000);
}

/** Restore the last queue on boot — PAUSED (autoplay needs a gesture). Call once after connect. */
export function restore(): void {
	if (restored) return;
	restored = true;
	const saved = readJSON<{
		queue: Metadata[];
		index: number;
		time: number;
		repeat: Repeat;
		shuffle: boolean;
	} | null>(KEY, null);
	if (!saved || !Array.isArray(saved.queue) || saved.queue.length === 0) return;
	player.queue = saved.queue;
	base = saved.queue.slice();
	player.index = saved.index ?? 0;
	player.repeat = saved.repeat ?? 'off';
	player.shuffle = !!saved.shuffle;
	const t = currentTrack();
	// Resume where you left off — prefer the server-side viewOffset if it's further along.
	const resumeAt = Math.max(saved.time ?? 0, (t?.viewOffset ?? 0) / 1000);
	player.currentTime = resumeAt;
	const a = ensure();
	if (t && a) {
		candidates = playbackCandidates(t);
		candidateIdx = 0;
		if (candidates.length) {
			a.src = candidates[0];
			const onMeta = () => {
				a.currentTime = resumeAt;
				a.removeEventListener('loadedmetadata', onMeta);
			};
			a.addEventListener('loadedmetadata', onMeta);
			setNowPlayingMetadata(t);
		}
	}
}

// --- "Mixes for you" → endless artist radio (server-side continuous play queue) ---
let extending = false;

export async function playMixItem(item: Metadata): Promise<void> {
	try {
		logEvent(`mix tap: ${item.type} "${item.title}" key=${item.key ?? item.ratingKey ?? '?'}`);
		const stationKey = await resolveMixStationKey(item);
		if (!stationKey) {
			logEvent('mix: could not resolve a station key');
			return;
		}
		const q = await createPlayQueue(stationUri(stationKey), { continuous: true });
		if (!q.items.length) {
			logEvent('mix: empty radio queue');
			return;
		}
		playList(q.items, 0, {
			radio: { playQueueID: q.playQueueID, lastItemID: q.lastItemID, artistKey: '' }
		});
	} catch (e) {
		logEvent(`mix failed: ${(e as Error)?.message ?? e}`);
	}
}

async function extendRadio(): Promise<void> {
	const r = player.radio;
	if (!r || extending || r.lastItemID == null) return;
	extending = true;
	try {
		const q = await pagePlayQueue(r.playQueueID, r.lastItemID);
		const have = new Set(player.queue.map((t) => t.playQueueItemID));
		const fresh = q.items.filter((t) => t.playQueueItemID == null || !have.has(t.playQueueItemID));
		if (fresh.length) {
			appendToQueue(fresh);
			const lastId = q.items[q.items.length - 1]?.playQueueItemID ?? r.lastItemID;
			player.radio = { ...r, lastItemID: lastId };
		}
	} catch (e) {
		logEvent(`radio paging failed: ${(e as Error)?.message ?? e}`);
	} finally {
		extending = false;
	}
}

/** "Artist Mix" — endless radio seeded from an artist's station. */
export async function playArtistRadio(artistKey: string): Promise<void> {
	try {
		const stationKey = await getArtistStationKey(artistKey);
		if (!stationKey) {
			logEvent(`no radio station for artist ${artistKey}`);
			return;
		}
		const q = await createPlayQueue(stationUri(stationKey), { continuous: true });
		if (!q.items.length) {
			logEvent('artist radio: empty queue');
			return;
		}
		playList(q.items, 0, { radio: { playQueueID: q.playQueueID, lastItemID: q.lastItemID, artistKey } });
	} catch (e) {
		logEvent(`artist radio failed: ${(e as Error)?.message ?? e}`);
	}
}

/** Shuffle an artist's whole catalog (server-built shuffled play queue). */
export async function shuffleArtist(artistKey: string): Promise<void> {
	try {
		const q = await createPlayQueue(stationUri(`/library/metadata/${artistKey}`), { shuffle: true });
		if (!q.items.length) {
			logEvent('artist shuffle: empty queue');
			return;
		}
		playList(q.items, 0, { shuffle: true });
	} catch (e) {
		logEvent(`artist shuffle failed: ${(e as Error)?.message ?? e}`);
	}
}
