<script lang="ts">
	// Home — Plex-style hub rows for the active library, in the user's preferred order.
	import { activeSection } from '$lib/stores/library.svelte';
	import { getHubs, getPlaylists, getItemsByKey } from '$lib/plex/library';
	import { createPlayQueueFromPlaylist, createPlayQueue, stationUri } from '$lib/plex/playback';
	import { playMixItem, playList } from '$lib/stores/player.svelte';
	import { logEvent } from '$lib/stores/debug.svelte';
	import HubRow from '$lib/components/HubRow.svelte';
	import type { Hub, Metadata } from '$lib/plex/types';

	type Kind = 'mixes' | 'recentlyPlayed' | 'recentlyAdded' | 'onThisDay' | 'playlists' | 'other';
	type Row = {
		key: string;
		title: string;
		items: Metadata[];
		variant?: 'tile' | 'mix';
		tileSize?: number;
		subtitleFor?: (m: Metadata) => string;
		onItem?: (m: Metadata) => void;
	};

	let rows = $state<Row[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Tracks behind each mix (keyed by ratingKey), fetched during enrichment and reused for playback.
	const mixTracks = new Map<string, Metadata[]>();

	const section = $derived(activeSection());

	$effect(() => {
		const sec = section;
		if (!sec) return;
		const ctrl = new AbortController();
		void load(sec.key, sec.title, ctrl.signal);
		return () => ctrl.abort();
	});

	// Classify a hub by identifier OR title OR type — naming varies by server version/locale.
	function kindOf(h: Hub): Kind {
		const s = `${h.hubIdentifier} ${h.title} ${h.type}`.toLowerCase();
		if (s.includes('mix')) return 'mixes';
		if (s.includes('recentlyplayed') || s.includes('recently played') || s.includes('lastplayed'))
			return 'recentlyPlayed';
		if (s.includes('recentlyadded') || s.includes('recently added')) return 'recentlyAdded';
		if (
			s.includes('onthisday') ||
			s.includes('on this day') ||
			s.includes('this day') ||
			s.includes('anniversary') ||
			s.includes('memories') ||
			s.includes('years ago')
		)
			return 'onThisDay';
		if (s.includes('playlist')) return 'playlists';
		return 'other';
	}

	const ORDER: Record<Kind, number> = {
		mixes: 0,
		recentlyPlayed: 1,
		recentlyAdded: 2,
		onThisDay: 3,
		playlists: 4,
		other: 6
	};

	function labelFor(kind: Kind, h: Hub, sectionTitle: string): string {
		switch (kind) {
			case 'mixes':
				return 'Mixes for you';
			case 'recentlyPlayed':
				return 'Recent plays';
			case 'recentlyAdded':
				return `Recently added in ${sectionTitle}`;
			case 'onThisDay':
				return 'On this day';
			case 'playlists':
				return 'Recent playlists';
			default:
				return h.title;
		}
	}

	// "On This Day" items are albums released today in prior years — label = now − release year.
	function yearsAgo(m: Metadata): string {
		if (!m.year) return '';
		const diff = new Date().getFullYear() - m.year;
		if (diff <= 0) return String(m.year);
		return `${diff} year${diff === 1 ? '' : 's'} ago · ${m.year}`;
	}

	// "Mixes for you" items have no art or artist reference of their own. Resolve each mix's tracks
	// (which carry grandparentThumb = artist image + grandparentTitle = artist name) the documented
	// way: a play queue from its playlistID, else a play queue from its key-as-uri, else a plain GET
	// of the item content. Those tracks drive the card art/artists AND playback; we log which method
	// each mix resolved through so the diagnostics panel makes failures obvious.
	function mixId(m: Metadata): string {
		return m.ratingKey ?? m.key ?? m.title;
	}
	function playableTracks(items: Metadata[]): Metadata[] {
		return items.filter((t) => !!t.Media?.[0]?.Part?.[0]?.key);
	}

	async function fetchMixViaGet(m: Metadata, signal?: AbortSignal): Promise<Metadata[]> {
		const sources: string[] = [];
		if (m.key) sources.push(m.key);
		if (m.ratingKey) {
			sources.push(`/playlists/${m.ratingKey}/items`);
			sources.push(`/library/metadata/${m.ratingKey}/children`);
		}
		let artOnly: Metadata[] = [];
		for (const path of sources) {
			try {
				const items = (await getItemsByKey(path, { size: 100 }, signal)).filter(
					(t) => t.type === 'track' || !!t.grandparentTitle
				);
				if (!items.length) continue;
				if (playableTracks(items).length) return items;
				if (!artOnly.length) artOnly = items;
			} catch {
				/* next source */
			}
		}
		return artOnly;
	}

	async function resolveMixTracks(m: Metadata, signal?: AbortSignal): Promise<Metadata[]> {
		// 1) Documented: play queue from a playlist/mix ID. The PQ response carries playable tracks.
		if (m.ratingKey) {
			try {
				const q = await createPlayQueueFromPlaylist(m.ratingKey, {}, signal);
				if (playableTracks(q.items).length) {
					logEvent(`mix "${m.title}": ${q.items.length} via playlistID`);
					return q.items;
				}
			} catch (e) {
				logEvent(`mix "${m.title}" playlistID failed: ${(e as Error)?.message ?? e}`);
			}
		}
		// 2) Play queue from the item's key as a library uri (stations / generic items).
		if (m.key) {
			try {
				const q = await createPlayQueue(stationUri(m.key), {}, signal);
				if (playableTracks(q.items).length) {
					logEvent(`mix "${m.title}": ${q.items.length} via uri`);
					return q.items;
				}
			} catch (e) {
				logEvent(`mix "${m.title}" uri failed: ${(e as Error)?.message ?? e}`);
			}
		}
		// 3) Plain GET of the item content / playlist items / children.
		const got = await fetchMixViaGet(m, signal);
		if (got.length) {
			logEvent(`mix "${m.title}": ${got.length} via GET (${playableTracks(got).length} playable)`);
			return got;
		}
		logEvent(`mix "${m.title}": UNRESOLVED type=${m.type} key=${m.key ?? '?'} rk=${m.ratingKey ?? '?'}`);
		return [];
	}

	function mixArt(m: Metadata, tracks: Metadata[]): Metadata {
		const seedName = m.title.replace(/\s+mix$/i, '').trim().toLowerCase();
		const seed = tracks.find((t) => (t.grandparentTitle ?? '').toLowerCase() === seedName) ?? tracks[0];
		const seedArtist = (seed.grandparentTitle ?? '').toLowerCase();
		const artists: string[] = [];
		for (const t of tracks) {
			const a = t.grandparentTitle?.trim();
			if (a && a.toLowerCase() !== seedArtist && !artists.some((x) => x.toLowerCase() === a.toLowerCase()))
				artists.push(a);
			if (artists.length >= 6) break;
		}
		return {
			...m,
			thumb: seed.grandparentThumb ?? seed.thumb ?? m.thumb,
			grandparentRatingKey: seed.grandparentRatingKey ?? m.grandparentRatingKey,
			summary: artists.join(', ')
		} satisfies Metadata;
	}

	async function playMix(m: Metadata) {
		let tracks = mixTracks.get(mixId(m)) ?? [];
		if (!playableTracks(tracks).length) {
			tracks = await resolveMixTracks(m);
			if (tracks.length) mixTracks.set(mixId(m), tracks);
		}
		const playable = playableTracks(tracks);
		if (playable.length) {
			playList(playable);
			return;
		}
		void playMixItem(m); // last resort: artist radio station
	}

	async function enrichMixes(mixRow: Row, signal: AbortSignal) {
		const enriched = await Promise.all(
			mixRow.items.map(async (m, i) => {
				if (i >= 8) return m; // bound play-queue creations on home load
				try {
					const tracks = await resolveMixTracks(m, signal);
					if (signal.aborted || !tracks.length) return m;
					mixTracks.set(mixId(m), tracks);
					return mixArt(m, tracks);
				} catch {
					return m;
				}
			})
		);
		if (signal.aborted) return;
		rows = rows.map((r) => (r.key === mixRow.key ? { ...r, items: enriched } : r));
		logEvent(`mixes enriched: ${enriched.filter((m) => m.thumb).length}/${enriched.length} got art`);
	}

	async function load(sectionId: string, sectionTitle: string, signal: AbortSignal) {
		loading = true;
		error = null;
		rows = [];
		try {
			const hubs = await getHubs(sectionId, 16, signal);
			if (signal.aborted) return;
			logEvent(`hubs: ${hubs.map((h) => `${h.hubIdentifier}(${h.items.length})`).join(', ') || 'none'}`);
			const mi = hubs.find((h) => kindOf(h) === 'mixes')?.items?.[0];
			if (mi) logEvent(`mix item RAW: ${JSON.stringify(mi).slice(0, 700)}`);

			const built: Row[] = hubs
				.map((h) => ({ kind: kindOf(h), hub: h }))
				.sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
				.map(({ kind, hub }) => ({
					key: hub.hubIdentifier,
					title: labelFor(kind, hub, sectionTitle),
					items: hub.items,
					variant: kind === 'mixes' ? ('mix' as const) : undefined,
					tileSize: kind === 'mixes' ? 220 : undefined,
					subtitleFor:
						kind === 'mixes'
							? (m: Metadata) => m.summary ?? ''
							: kind === 'onThisDay'
								? yearsAgo
								: undefined,
					onItem: kind === 'mixes' ? (m: Metadata) => void playMix(m) : undefined
				}));

			const hasPlaylists = hubs.some((h) => kindOf(h) === 'playlists');
			if (!hasPlaylists) {
				try {
					const pl = await getPlaylists({ size: 16 }, signal);
					if (!signal.aborted && pl.items.length) {
						built.push({ key: 'recent.playlists', title: 'Recent playlists', items: pl.items });
					}
				} catch {
					/* playlists are best-effort */
				}
			}

			rows = built.filter((r) => r.items.length > 0);

			// Fill in mix art + included-artists after first paint (each mix needs its tracks fetched).
			const mixRow = rows.find((r) => r.variant === 'mix');
			if (mixRow) void enrichMixes(mixRow, signal);
		} catch (e) {
			if (!signal.aborted) error = e instanceof Error ? e.message : String(e);
		} finally {
			if (!signal.aborted) loading = false;
		}
	}
</script>

<section class="page home">
	<h1>{section?.title ?? 'Home'}</h1>

	{#if loading && rows.length === 0}
		<div class="center"><div class="spinner" aria-hidden="true"></div></div>
	{:else if error}
		<p class="err">{error}</p>
	{:else if rows.length === 0}
		<p class="dim">Your server didn't return any home rows for this library yet.</p>
	{:else}
		{#each rows as row (row.key)}
			<HubRow
				title={row.title}
				items={row.items}
				variant={row.variant}
				tileSize={row.tileSize}
				subtitleFor={row.subtitleFor}
				onItem={row.onItem}
			/>
		{/each}
	{/if}
</section>

<style>
	.center {
		display: grid;
		place-items: center;
		padding: 4rem 0;
	}
	.spinner {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: 4px solid var(--surface);
		border-top-color: var(--accent);
		animation: spin 0.9s linear infinite;
	}
	.err {
		color: var(--accent);
		font-family: ui-monospace, Menlo, monospace;
		word-break: break-word;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
