<script lang="ts">
	// Search — deliberate-tap entry (spec §7: secondary, on-screen keyboard). Debounced, grouped.
	import { activeSection } from '$lib/stores/library.svelte';
	import { search } from '$lib/plex/library';
	import HubRow from '$lib/components/HubRow.svelte';
	import type { Hub } from '$lib/plex/types';

	let q = $state('');
	let results = $state<Hub[]>([]);
	let loading = $state(false);
	let searched = $state(false);
	let error = $state<string | null>(null);

	const section = $derived(activeSection());

	$effect(() => {
		const query = q.trim();
		const sec = section;
		if (!query || !sec) {
			results = [];
			loading = false;
			searched = false;
			return;
		}
		loading = true;
		const ctrl = new AbortController();
		const timer = setTimeout(() => void run(query, sec.key, ctrl.signal), 300);
		return () => {
			clearTimeout(timer);
			ctrl.abort();
		};
	});

	async function run(query: string, sectionId: string, signal: AbortSignal) {
		error = null;
		try {
			const hubs = await search(query, sectionId, 16, signal);
			if (signal.aborted) return;
			// Keep only music result groups (artists/albums/tracks/playlists).
			results = hubs.filter((h) => /artist|album|track|playlist/i.test(`${h.type} ${h.hubIdentifier}`));
			searched = true;
		} catch (e) {
			if (!signal.aborted) error = e instanceof Error ? e.message : String(e);
		} finally {
			if (!signal.aborted) loading = false;
		}
	}
</script>

<section class="page search">
	<h1>Search</h1>

	<input
		class="box"
		type="search"
		placeholder={`Search ${section?.title ?? 'your library'}…`}
		bind:value={q}
		autocomplete="off"
		autocapitalize="off"
		autocorrect="off"
		spellcheck="false"
	/>

	{#if loading}
		<div class="center"><div class="spinner" aria-hidden="true"></div></div>
	{:else if error}
		<p class="err">{error}</p>
	{:else if results.length}
		{#each results as hub (hub.hubIdentifier)}
			<HubRow title={hub.title} items={hub.items} />
		{/each}
	{:else if q.trim() && searched}
		<p class="dim">No results for “{q.trim()}”.</p>
	{:else}
		<p class="dim">Search artists, albums, tracks, and playlists.</p>
	{/if}
</section>

<style>
	.box {
		width: 100%;
		max-width: 640px;
		min-height: var(--tap-min);
		padding: 0 1.25rem;
		margin-bottom: 1.5rem;
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font-size: 1.2rem;
	}
	.box::placeholder {
		color: var(--text-dim);
	}
	.center {
		display: grid;
		place-items: center;
		padding: 3rem 0;
	}
	.spinner {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: 4px solid var(--surface);
		border-top-color: var(--accent);
		animation: spin 0.9s linear infinite;
	}
	.err {
		color: var(--accent);
		font-family: ui-monospace, Menlo, monospace;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
