// Playback engine: one HTMLAudioElement managed by a runes store. Albums/playlists become a
// client-side queue; "Mixes for you" radio (server play queue) is layered on in playback.ts (3b).

import type { Metadata } from '$lib/plex/types';
import { streamUrl, transcodeUrl, artUrl } from '$lib/plex/media';
import {
	getArtistStationKey,
	resolveMixStationKey,
	stationUri,
	createPlayQueue,
	pagePlayQueue
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
let audio: HTMLAudioElement | null = null;
let restored = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

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

function el(): HTMLAudioElement | null {
	if (typeof Audio === 'undefined') return null;
	if (audio) return audio;
	audio = new Audio();
	audio.preload = 'auto';
	audio.addEventListener('timeupdate', () => {
		if (audio) player.currentTime = audio.currentTime;
		persistSoon();
	});
	audio.addEventListener('durationchange', () => {
		if (audio) player.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
	});
	audio.addEventListener('play', () => (player.playing = true));
	audio.addEventListener('pause', () => (player.playing = false));
	audio.addEventListener('ended', () => next(true));
	audio.addEventListener('error', onError);
	setupMediaSessionHandlers();
	return audio;
}

let triedTranscode = false;

function load(track: Metadata, autoplay: boolean) {
	const a = el();
	if (!a) return;
	const url = streamUrl(track);
	if (!url) {
		logEvent(`no stream url for "${track.title}"`);
		return;
	}
	triedTranscode = false;
	a.src = url;
	a.load();
	setNowPlayingMetadata(track);
	if (autoplay) void a.play().catch((e: unknown) => logEvent(`play blocked: ${(e as Error)?.name ?? e}`));
}

function onError() {
	const track = currentTrack();
	if (!audio || !track) return;
	if (!triedTranscode) {
		// Direct play failed (likely an unsupported codec) — try a transcode once.
		triedTranscode = true;
		const turl = transcodeUrl(track);
		if (turl) {
			logEvent(`direct play failed; transcoding "${track.title}"`);
			audio.src = turl;
			audio.load();
			void audio.play().catch(() => {});
			return;
		}
	}
	logEvent(`playback failed for "${track.title}" — skipping`);
	next(true);
}

function goTo(i: number) {
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
	persist();
}

export function toggleExpanded(): void {
	player.expanded = !player.expanded;
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
	player.currentTime = saved.time ?? 0;
	const t = currentTrack();
	const a = el();
	if (t && a) {
		const url = streamUrl(t);
		if (url) {
			a.src = url;
			const onMeta = () => {
				a.currentTime = saved.time ?? 0;
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
