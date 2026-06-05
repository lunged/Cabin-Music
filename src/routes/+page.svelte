<script lang="ts">
	// Home — Plex-style hub rows for the active library, in the user's preferred order.
	import { activeSection } from '$lib/stores/library.svelte';
	import { getHubs, getPlaylists, findArtist, getLovedTracks, getAll, TYPE } from '$lib/plex/library';
	import { playMixItem, playArtistRadio, playList } from '$lib/stores/player.svelte';
	import { logEvent } from '$lib/stores/debug.svelte';
	import HubRow from '$lib/components/HubRow.svelte';
	import Icon from '$lib/components/Icon.svelte';
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

	// Resolved seed-artist ratingKey per mix → card shows the right artist image, and tapping plays
	// that artist's radio (exactly like the artist page's "Artist Mix").
	const mixArtistKey = new Map<string, string>();

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

	// "Mixes for you" are "{Artist} Mix" items with no usable art/artist reference of their own.
	// Resolve the seed artist by name (title minus " Mix") — that gives the correct artist image AND
	// the key to play the mix as that artist's radio, identical to the artist page's "Artist Mix".
	function mixId(m: Metadata): string {
		return m.ratingKey ?? m.key ?? m.title;
	}

	async function resolveMixArtist(
		m: Metadata,
		sectionId: string,
		signal?: AbortSignal
	): Promise<Metadata | null> {
		const name = m.title.replace(/\s+mix$/i, '').trim();
		if (!name) return null;
		try {
			return await findArtist(name, sectionId, signal);
		} catch {
			return null;
		}
	}

	async function playMix(m: Metadata) {
		let key = mixArtistKey.get(mixId(m));
		if (!key) {
			const sec = section;
			const artist = sec ? await resolveMixArtist(m, sec.key) : null;
			if (artist) {
				key = artist.ratingKey;
				mixArtistKey.set(mixId(m), key);
			}
		}
		if (key) {
			void playArtistRadio(key); // continuous artist radio — same as the artist page
			return;
		}
		void playMixItem(m); // fallback: best-effort station resolution from the item itself
	}

	async function enrichMixes(mixRow: Row, sectionId: string, signal: AbortSignal) {
		const enriched = await Promise.all(
			mixRow.items.map(async (m) => {
				try {
					const artist = await resolveMixArtist(m, sectionId, signal);
					if (signal.aborted || !artist) return m;
					mixArtistKey.set(mixId(m), artist.ratingKey);
					return {
						...m,
						thumb: artist.thumb ?? m.thumb,
						grandparentRatingKey: artist.ratingKey
					} satisfies Metadata;
				} catch {
					return m;
				}
			})
		);
		if (signal.aborted) return;
		rows = rows.map((r) => (r.key === mixRow.key ? { ...r, items: enriched } : r));
		logEvent(`mixes: resolved ${enriched.filter((m) => mixArtistKey.has(mixId(m))).length}/${enriched.length} seed artists`);
	}

	// "Shuffle all" — play a random sample of the whole library (one-tap "just play something").
	let shuffling = $state(false);
	async function shuffleLibrary() {
		const sec = section;
		if (!sec || shuffling) return;
		shuffling = true;
		try {
			const res = await getAll(sec.key, { type: TYPE.track, sort: 'random', size: 200 });
			if (res.items.length) playList(res.items, 0, { shuffle: true });
		} catch (e) {
			logEvent(`shuffle library failed: ${(e as Error)?.message ?? e}`);
		} finally {
			shuffling = false;
		}
	}

	// "Loved" row — tracks the user has hearted (userRating 10). Loaded after first paint and appended
	// at the bottom of the page; tapping a tile plays the loved set from there.
	async function loadLoved(sectionId: string, signal: AbortSignal) {
		try {
			const loved = await getLovedTracks(sectionId, { size: 24 }, signal);
			if (signal.aborted || !loved.items.length) return;
			const items = loved.items;
			const row: Row = {
				key: 'loved',
				title: 'Loved',
				items,
				onItem: (t: Metadata) => playList(items, Math.max(0, items.indexOf(t)))
			};
			rows = [...rows, row]; // append at the bottom of the page

		} catch {
			/* the Loved row is best-effort */
		}
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
					subtitleFor: kind === 'onThisDay' ? yearsAgo : undefined,
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
			if (mixRow) void enrichMixes(mixRow, sectionId, signal);
			void loadLoved(sectionId, signal);
		} catch (e) {
			if (!signal.aborted) error = e instanceof Error ? e.message : String(e);
		} finally {
			if (!signal.aborted) loading = false;
		}
	}
</script>

<section class="page home">
	<div class="home-head">
		<h1>{section?.title ?? 'Home'}</h1>
		<button class="shuffle-all" onclick={shuffleLibrary} disabled={shuffling || !section}>
			<Icon name="shuffle" size={18} /> Shuffle all
		</button>
	</div>

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
	.home-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1.25rem;
	}
	.home-head h1 {
		margin: 0;
		font-size: clamp(1.6rem, 3.2vw, 2.5rem);
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.shuffle-all {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 48px;
		padding: 0 1.4rem;
		border-radius: 999px;
		background: var(--surface);
		color: var(--text);
		font-size: 1rem;
		font-weight: 600;
	}
	.shuffle-all:disabled {
		opacity: 0.5;
	}
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
