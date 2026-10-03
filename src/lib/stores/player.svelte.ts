// Playback engine: one HTMLAudioElement for the music (plus an inaudible keep-alive element, see
// below) managed by a runes store. Albums/playlists become a client-side queue; "Mixes for you"
// radio (server play queue) is layered on in playback.ts (3b).

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
import { getSonicallySimilar } from '$lib/plex/library';
import { readJSON, writeJSON } from '$lib/plex/storage';
import { STORAGE_PREFIX } from '$lib/plex/config';
import { logEvent } from '$lib/stores/debug.svelte';

const KEY = STORAGE_PREFIX + 'player';
const KEEP_KEY = STORAGE_PREFIX + 'keepalive';

/** What the keep-alive element plays: an inaudible tone (default), digital silence, or nothing. */
export type KeepAlive = 'tone' | 'silent' | 'off';
const KEEP_MODES: KeepAlive[] = ['tone', 'silent', 'off'];
function loadKeepAlive(): KeepAlive {
	const v = readJSON<KeepAlive>(KEEP_KEY, 'tone');
	return KEEP_MODES.includes(v) ? v : 'tone';
}
export const keepAlive = $state({ mode: loadKeepAlive() });

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
// A SINGLE <audio> element plays the music; each track is a src swap on it.
let audio: HTMLAudioElement | null = null;
// The keep-alive: a second, looping, inaudible element that plays for as long as the player is
// logically playing. Chromium drops a page's media session (and its audio output stream) the instant
// its only playing element ends, and only rebuilds it once the next src has data. The working theory
// (the browser half is verified, the car half is not yet confirmed on a car) is that the car reads that
// lapse as "browser audio ended": it resumes its own media source for the length of the gap and, with
// the browser off screen, never lets the next track start. A second player that never ends keeps the
// session alive across every track change.
let keep: HTMLAudioElement | null = null;
let keepWanted = false; // what WE last asked of the keep-alive; anything else it does came from outside
let loadAt = 0; // when the current src was assigned (logs the load gap; 0 once it is playing)
let restored = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let candidates: string[] = []; // ordered playback URLs for the current track (quality + fallbacks)
let candidateIdx = 0;
let lastTimelineAt = 0;

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
	// Use an <audio> element. (A <video> element earns richer car transport controls, BUT the Tesla
	// then treats playback as VIDEO and greys out ALL controls while driving — worse for a music app —
	// so we stay with <audio>, accepting the car's limited web-audio controls.) Attached to the DOM for
	// best-effort OS/car media recognition.
	const a = new Audio();
	a.preload = 'auto';
	if (typeof document !== 'undefined') {
		a.setAttribute('aria-hidden', 'true');
		document.body.appendChild(a);
	}
	a.addEventListener('timeupdate', () => {
		player.currentTime = a.currentTime;
		persistSoon();
		maybeReportTimeline();
	});
	a.addEventListener('durationchange', () => {
		// A non-finite duration (chunked transcode) keeps the Plex duration that load() published.
		if (Number.isFinite(a.duration) && a.duration > 0) player.duration = a.duration;
		syncMediaPosition();
	});
	a.addEventListener('play', () => {
		if (!player.playing && !loadAt) logEvent(`resumed${vis()}`);
		player.playing = true;
		reportNow('playing');
		syncMediaPlaybackState();
		syncMediaPosition();
	});
	a.addEventListener('playing', () => {
		// Sound is really coming out now. Starting the keep-alive only here means the audible track is
		// what takes the car's audio, and the keep-alive just holds on to it.
		keepOn();
		syncMediaPosition(); // the published position kept running while the track loaded
		if (loadAt) {
			logEvent(`playing "${currentTrack()?.title ?? '?'}" after ${Date.now() - loadAt}ms${vis()}`);
			loadAt = 0;
		}
	});
	a.addEventListener('pause', () => {
		// The browser fires 'pause' right before 'ended' when a track finishes on its own. That is a
		// track change, not a pause — publishing it would tell the car the music stopped.
		if (a.ended) return;
		onPause();
	});
	a.addEventListener('ended', () => {
		logEvent(`ended "${currentTrack()?.title ?? '?'}"${vis()}`);
		reportNow('paused'); // final position, so Plex counts the play (the 'pause' listener used to send it)
		next(true);
	});
	a.addEventListener('error', onError);
	audio = a;
	setupMediaSessionHandlers();
	registerUnloadFlush();
	return audio;
}

/** ' (hidden)' while the page is off screen — the case the diagnostics log most needs to show. */
function vis(): string {
	return typeof document !== 'undefined' && document.visibilityState === 'hidden' ? ' (hidden)' : '';
}

// --- keep-alive ---
// 10 s of stereo 16-bit PCM in a WAV Blob. What makes it count for the browser's media session: it
// has an audio track, lasts over 5 s (shorter clips are "transient" and drop the car's controls),
// loops, and plays unmuted at full volume. Stereo so it shares the music's output stream.
// The 'tone' is 20 Hz at about −60 dBFS: tens of dB below what anyone can hear at 20 Hz, but above the
// −72 dBFS level at which Chromium calls a tab "audible". That covers a car that judges "browser audio
// stopped" by sound level, not just by session or stream state. Leave the element's volume at 1 —
// the level lives in the samples. Tune KEEP_AMP if a car needs more; Settings can switch to pure
// silence or turn the keep-alive off.
const KEEP_HZ = 20; // whole cycles per second → the loop point is seamless
const KEEP_AMP = 33; // peak, in 16-bit steps: 33/32768 ≈ −60 dBFS
function keepWav(amp: number): string {
	const rate = 44100;
	const n = rate * 10; // frames
	const buf = new ArrayBuffer(44 + n * 4);
	const v = new DataView(buf);
	const tag = (at: number, s: string) => {
		for (let i = 0; i < 4; i++) v.setUint8(at + i, s.charCodeAt(i));
	};
	tag(0, 'RIFF');
	v.setUint32(4, 36 + n * 4, true);
	tag(8, 'WAVE');
	tag(12, 'fmt ');
	v.setUint32(16, 16, true); // fmt chunk size
	v.setUint16(20, 1, true); // PCM
	v.setUint16(22, 2, true); // channels
	v.setUint32(24, rate, true);
	v.setUint32(28, rate * 4, true); // bytes per second
	v.setUint16(32, 4, true); // bytes per frame
	v.setUint16(34, 16, true); // bits per sample
	tag(36, 'data');
	v.setUint32(40, n * 4, true);
	if (amp) {
		for (let i = 0; i < n; i++) {
			const s = Math.round(amp * Math.sin((2 * Math.PI * KEEP_HZ * i) / rate));
			v.setInt16(44 + i * 4, s, true);
			v.setInt16(46 + i * 4, s, true);
		}
	}
	return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/** Create the keep-alive (once). Called from every play request, so the first call is inside a user
 *  gesture: load() there also lifts a per-element autoplay lock, should the car's browser use one. */
function armKeep() {
	if (keep || keepAlive.mode === 'off' || typeof Audio === 'undefined') return;
	const k = new Audio(keepWav(keepAlive.mode === 'tone' ? KEEP_AMP : 0));
	k.loop = true;
	// The browser or the car can pause/resume every player behind our back (the widget's stop button,
	// a system suspend and resume). Follow it, so the music and the keep-alive never disagree.
	// Events arrive a task late, so only act on one that still matches the element's state and that we
	// did not ask for ourselves.
	k.addEventListener('pause', () => {
		if (k !== keep || !keepWanted || !k.paused) return;
		logEvent(`keep-alive paused externally${vis()}`);
		pause();
	});
	k.addEventListener('play', () => {
		if (k !== keep || keepWanted || k.paused) return;
		logEvent(`keep-alive resumed externally${vis()}`);
		play();
	});
	k.addEventListener('error', () => logEvent('keep-alive failed to load'));
	k.load();
	keep = k;
	logEvent(`keep-alive ready: ${keepAlive.mode}`);
}
function keepOn() {
	keepWanted = true;
	if (keep?.paused)
		void keep.play().catch((e: unknown) => logEvent(`keep-alive blocked: ${(e as Error)?.name ?? e}${vis()}`));
}
function keepOff() {
	keepWanted = false;
	keep?.pause();
}
/** Retire the keep-alive element; armKeep() builds a new one on the next play request. Unloading it
 *  (not just pausing) takes its player out of the media session, which then lets go of the audio. */
function dropKeep() {
	const k = keep;
	keep = null; // its listeners now ignore it
	keepWanted = false;
	if (!k) return;
	const url = k.src;
	k.pause();
	k.removeAttribute('src');
	k.load();
	URL.revokeObjectURL(url);
}

/** Choose what the keep-alive plays (Settings). Takes effect immediately. */
export function setKeepAlive(mode: KeepAlive): void {
	keepAlive.mode = mode;
	writeJSON(KEEP_KEY, mode);
	if (mode === 'off') logEvent('keep-alive off');
	dropKeep();
	if (player.playing) {
		armKeep();
		keepOn();
	}
}

/** The player is now paused — by the user, the car's widget, or the browser. */
function onPause() {
	player.playing = false;
	keepOff();
	logEvent(`paused${vis()}`);
	reportNow('paused');
	syncMediaPlaybackState();
	syncMediaPosition();
}

/** Playback is over (end of queue, queue emptied, nothing playable): let go of the media session
 *  entirely, as a single element does when its last track ends. */
function halt() {
	player.playing = false;
	dropKeep();
	syncMediaPlaybackState();
}

function playBlocked(e: unknown) {
	const name = (e as Error)?.name ?? String(e);
	if (name === 'AbortError') return; // superseded by a newer load() or pause() — not a failure
	logEvent(`play blocked: ${name}${vis()}`);
	if (name === 'NotAllowedError') onPause(); // the browser refused: we are paused, not playing
}
/** The current audio element (single element; kept as a helper so callers read clearly). */
function active(): HTMLAudioElement | null {
	return audio;
}
/** No-op now — single-element playback has nothing to prefetch. Kept so queue-mutation callers and
 *  the quality-change hook stay simple. */
function reprime() {}

function load(track: Metadata, autoplay: boolean) {
	const a = el();
	if (!a) return;
	candidates = playbackCandidates(track);
	candidateIdx = 0;
	if (!candidates.length) {
		logEvent(`no playable url for "${track.title}"`);
		halt();
		return;
	}
	a.src = candidates[0];
	a.load();
	loadAt = Date.now();
	// Publish the new track's timeline now, from Plex's duration, before anything plays. The position
	// must never be unset while two elements are playing: Chromium ≤150 answers that by wiping the
	// title and artwork from the system's media controls.
	player.currentTime = 0;
	player.duration = (track.duration ?? 0) / 1000;
	setNowPlayingMetadata(track);
	syncMediaPosition();
	if (autoplay) play();
}

function onError() {
	const a = active();
	const track = currentTrack();
	if (!a || !track) return;
	// An error on a paused (or just-restored) track must not start the music or walk the queue.
	const go = player.playing;
	// Walk the fallback chain (e.g. transcode after a failed direct play, or vice-versa).
	candidateIdx++;
	if (candidateIdx < candidates.length) {
		logEvent(`playback fallback ${candidateIdx} for "${track.title}"`);
		a.src = candidates[candidateIdx];
		a.load();
		if (go) play();
		return;
	}
	logEvent(`playback failed for "${track.title}"${go ? ' — skipping' : ''}`);
	if (!go) return; // play() retries it
	if (player.repeat === 'one') halt(); // repeating a track that cannot play: nothing else to try
	else next(true);
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
	reprime();
}

/** Start or resume. Every play request goes through here. Safe to call when already playing. */
export function play(): void {
	const a = el();
	if (!a) return;
	const t = currentTrack();
	// A track that failed to load while paused (say, restored before the car was online): try again.
	if (a.error && t) return load(t, true);
	armKeep();
	void a.play().catch(playBlocked);
}

/** Pause. Safe to call when already paused. */
export function pause(): void {
	if (audio && !audio.paused) audio.pause(); // → its 'pause' listener → onPause()
}

export function toggle(): void {
	if (player.playing) pause();
	else play();
}

export function next(auto = false): void {
	if (!player.queue.length) return;
	if (auto && player.repeat === 'one') {
		seek(0);
		play();
		return;
	}
	// Radio: top up the queue before it drains.
	if (player.radio && player.index >= player.queue.length - 5) void extendRadio();
	let i = player.index + 1;
	if (i >= player.queue.length) {
		if (player.repeat === 'all') i = 0;
		else {
			// End of queue. (Radio extension is wired in 3b via appendToQueue.)
			if (!auto) return; // Next on the last track: nothing to skip to, keep playing
			logEvent(`end of queue${vis()}`);
			halt();
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
		syncMediaPosition();
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
		const a = active();
		if (a) {
			a.pause();
			a.removeAttribute('src');
			a.load();
		}
		halt();
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
// Drives the car's native now-playing widget (title/art) AND its transport buttons. Each handler is
// registered independently so one unsupported action can't drop the rest. Every action that arrives
// is logged: the diagnostics panel then shows what the car's buttons actually send, if anything.
function setupMediaSessionHandlers() {
	if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
	const ms = navigator.mediaSession;
	const set = (action: MediaSessionAction, handler: (d: MediaSessionActionDetails) => void) => {
		try {
			ms.setActionHandler(action, (d) => {
				lastActionAt = Date.now();
				logEvent(`media action: ${action}${vis()}`);
				handler(d);
			});
		} catch {
			/* this action is unsupported on this platform — skip just this one */
		}
	};
	// play/pause are explicit, never toggle(): a repeated or stale action must not flip the state.
	set('play', play);
	set('pause', pause);
	set('stop', pause); // the browser offers stop whether or not we handle it; treat it as pause
	set('previoustrack', prev);
	set('nexttrack', () => next());
	set('seekto', (d) => {
		if (typeof d.seekTime === 'number') seek(d.seekTime);
	});
}

// Hardware media keys, in case the car hands its steering-wheel / widget buttons to the page as key
// presses instead of media-session actions (a browser that handles them itself never sends these).
let lastActionAt = 0; // when the last media-session action arrived
const MEDIA_KEYS: Record<string, () => void> = {
	MediaTrackNext: () => next(),
	MediaTrackPrevious: prev,
	MediaPlayPause: toggle,
	MediaPlay: play,
	MediaPause: pause,
	MediaStop: pause
};

/** Publish play/pause state so the widget shows + enables the right controls. */
function syncMediaPlaybackState() {
	if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
	try {
		navigator.mediaSession.playbackState = player.playing ? 'playing' : 'paused';
	} catch {
		/* ignore */
	}
}

/** Publish duration + position so the widget shows a scrubber (and treats us as a rich session). */
function syncMediaPosition() {
	if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
	const ms = navigator.mediaSession;
	if (typeof ms.setPositionState !== 'function') return;
	try {
		const dur = player.duration;
		// Unknown duration → leave the last state in place. Never clear it (see load()).
		if (dur > 0 && Number.isFinite(dur)) {
			ms.setPositionState({ duration: dur, position: Math.min(player.currentTime, dur), playbackRate: 1 });
		}
	} catch {
		/* out-of-range/unsupported — ignore */
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
	let art = artUrl(track.parentThumb ?? track.thumb ?? track.grandparentThumb, 300);
	// MediaSession needs an absolute URL; artUrl is a same-origin /img path in production.
	if (art && art.startsWith('/') && typeof location !== 'undefined') art = location.origin + art;
	navigator.mediaSession.metadata = new MediaMetadata({
		// The Tesla widget shows the source URL on line 2 (ignoring `artist`), so fold the artist into
		// the title to surface it. `artist`/`album` stay set for platforms that show them properly.
		title: artist ? `${track.title} · ${artist}` : track.title,
		artist,
		album,
		artwork: art ? [{ src: art, sizes: '300x300', type: 'image/jpeg' }] : []
	});
	syncMediaPlaybackState();
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
		logEvent(`page ${document.visibilityState}`);
		if (document.visibilityState === 'hidden') flush();
	});
	// If the car freezes the page while it is off screen, these two bracket the gap in the log.
	document.addEventListener('freeze', () => logEvent('page frozen'));
	document.addEventListener('resume', () => logEvent('page resumed'));
	window.addEventListener('keydown', (e) => {
		const act = MEDIA_KEYS[e.key];
		if (!act || e.repeat) return;
		// A browser that also turns the press into a media-session action must not act twice: wait a
		// beat, then skip the key if an action has just been handled.
		setTimeout(() => {
			const dup = Date.now() - lastActionAt < 400;
			logEvent(`media key: ${e.key}${dup ? ' (already handled)' : ''}${vis()}`);
			if (!dup) act();
		}, 60);
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
	player.duration = (t?.duration ?? 0) / 1000;
	const a = el();
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
			syncMediaPosition();
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

/** "Track Radio" — play tracks sonically similar to the given song (Plex `/nearest`). Tracks don't
 *  expose a `station` like artists do, so we build the queue from the sonic-similarity results. */
export async function playTrackRadio(seed: Metadata | null | undefined): Promise<void> {
	if (!seed?.ratingKey) return;
	try {
		const similar = await getSonicallySimilar(seed.ratingKey, { limit: 60 });
		const playable = similar.filter(
			(t) => t.ratingKey !== seed.ratingKey && !!t.Media?.[0]?.Part?.[0]?.key
		);
		logEvent(`track radio: ${playable.length}/${similar.length} similar playable for "${seed.title}"`);
		if (!playable.length) return;
		playList(playable, 0);
	} catch (e) {
		logEvent(`track radio failed: ${(e as Error)?.message ?? e}`);
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
