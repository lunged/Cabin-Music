<script lang="ts">
	// Home — Plex-style hub rows for the active library, in the user's preferred order.
	import { activeSection } from '$lib/stores/library.svelte';
	import { getHubs, getPlaylists } from '$lib/plex/library';
	import { logEvent } from '$lib/stores/debug.svelte';
	import HubRow from '$lib/components/HubRow.svelte';
	import type { Hub, Metadata } from '$lib/plex/types';

	type Kind = 'mixes' | 'recentlyPlayed' | 'recentlyAdded' | 'onThisDay' | 'playlists' | 'other';
	type Row = { key: string; title: string; items: Metadata[] };

	let rows = $state<Row[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	const section = $derived(activeSection());

	$effect(() => {
		const sec = section;
		if (!sec) return;
		const ctrl = new AbortController();
		void load(sec.key, sec.title, ctrl.signal);
		return () => ctrl.abort();
	});

	// Classify a hub by identifier OR title OR type, so naming differences across servers still match.
	function kindOf(h: Hub): Kind {
		const s = `${h.hubIdentifier} ${h.title} ${h.type}`.toLowerCase();
		if (s.includes('mix')) return 'mixes';
		if (s.includes('recentlyplayed') || s.includes('recently played') || s.includes('lastplayed'))
			return 'recentlyPlayed';
		if (s.includes('recentlyadded') || s.includes('recently added')) return 'recentlyAdded';
		if (s.includes('onthisday') || s.includes('on this day')) return 'onThisDay';
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

	async function load(sectionId: string, sectionTitle: string, signal: AbortSignal) {
		loading = true;
		error = null;
		rows = [];
		try {
			const hubs = await getHubs(sectionId, 16, signal);
			if (signal.aborted) return;

			// Diagnostic: surface the real hub identifiers in the debug panel (long-press top-left).
			logEvent(`hubs: ${hubs.map((h) => `${h.hubIdentifier}(${h.items.length})`).join(', ') || 'none'}`);

			const built: Row[] = hubs
				.map((h) => ({ kind: kindOf(h), hub: h }))
				.sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
				.map(({ kind, hub }) => ({
					key: hub.hubIdentifier,
					title: labelFor(kind, hub, sectionTitle),
					items: hub.items
				}));

			// Always surface recent playlists, even if the server didn't return a playlist hub.
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
			<HubRow title={row.title} items={row.items} />
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
