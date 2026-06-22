<script lang="ts">
	import { page } from '$app/state';
	import { getMetadata, getChildren, getArtistAlbums, getSonicallySimilar } from '$lib/plex/library';
	import { activeSection } from '$lib/stores/library.svelte';
	import { artUrl } from '$lib/plex/media';
	import { shuffleArtist, playArtistRadio } from '$lib/stores/player.svelte';
	import ArtTile from '$lib/components/ArtTile.svelte';
	import HubRow from '$lib/components/HubRow.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { Metadata } from '$lib/plex/types';

	let header = $state<Metadata | null>(null);
	let albums = $state<Metadata[]>([]);
	let similar = $state<Metadata[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	const key = $derived(page.params.key);
	const heroArt = $derived(header ? artUrl(header.thumb, 280) : null);

	$effect(() => {
		const k = key;
		if (!k) return;
		const ctrl = new AbortController();
		void load(k, ctrl.signal);
		return () => ctrl.abort();
	});

	async function load(k: string, signal: AbortSignal) {
		loading = true;
		error = null;
		header = null;
		albums = [];
		similar = [];
		try {
			const sec = activeSection();
			const [meta, rel, sim] = await Promise.all([
				getMetadata(k, signal),
				// All release types (albums/EPs/singles/live/compilations) via a section search; falls
				// back to /children if the active section is somehow unavailable.
				sec
					? getArtistAlbums(sec.key, k, { size: 200 }, signal)
					: getChildren(k, { size: 200, sort: 'year:desc' }, signal),
				getSonicallySimilar(k, { limit: 16 }, signal).catch(() => [] as Metadata[])
			]);
			if (signal.aborted) return;
			header = meta;
			albums = rel.items;
			similar = sim.filter((s) => s.type === 'artist');
		} catch (e) {
			if (!signal.aborted) error = e instanceof Error ? e.message : String(e);
		} finally {
			if (!signal.aborted) loading = false;
		}
	}
</script>

<section class="page detail">
	<button class="back" onclick={() => history.back()}>← Back</button>

	{#if loading}
		<div class="center"><div class="spinner" aria-hidden="true"></div></div>
	{:else if error}
		<p class="err">{error}</p>
	{:else if header}
		<header class="hero">
			<div class="art round">
				{#if heroArt}<img src={heroArt} alt="" />{/if}
			</div>
			<div class="info">
				<p class="kind">Artist</p>
				<h1>{header.title}</h1>
				<p class="dim">{albums.length} album{albums.length === 1 ? '' : 's'}</p>
				<div class="actions">
					<button class="shuffle-btn" onclick={() => key && shuffleArtist(key)}>
						<Icon name="shuffle" size={18} /> Shuffle
					</button>
					<button class="mix-btn" onclick={() => key && playArtistRadio(key)}>
						<Icon name="radio" size={18} /> Artist Mix
					</button>
				</div>
			</div>
		</header>

		<div class="art-grid">
			{#each albums as a (a.ratingKey)}
				<div class="cell"><ArtTile item={a} size={156} /></div>
			{/each}
		</div>

		{#if similar.length}
			<div class="similar"><HubRow title="Similar artists" items={similar} /></div>
		{/if}
	{/if}
</section>

<style>
	.back {
		margin-bottom: 1rem;
		min-height: 44px;
		padding: 0 1rem;
		border-radius: 999px;
		background: var(--surface);
		color: var(--text);
		font-weight: 600;
	}
	.hero {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: clamp(1rem, 3vw, 2rem);
		margin-bottom: 2rem;
	}
	.art {
		flex: 0 0 auto;
		width: clamp(140px, 20vw, 240px);
		aspect-ratio: 1;
		border-radius: 12px;
		overflow: hidden;
		background: var(--surface);
	}
	.art.round {
		border-radius: 50%;
	}
	.art img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.kind {
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.8rem;
		color: var(--text-dim);
	}
	.info h1 {
		margin: 0.25rem 0;
		font-size: clamp(1.8rem, 4vw, 3rem);
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 1.25rem;
	}
	.shuffle-btn,
	.mix-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 52px;
		padding: 0 1.5rem;
		border-radius: 999px;
		font-size: 1rem;
		font-weight: 600;
	}
	.shuffle-btn {
		background: var(--accent);
		color: #fff;
	}
	.mix-btn {
		background: var(--surface);
		color: var(--text);
	}
	.art-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
		gap: 1.5rem 1rem;
		align-items: start;
	}
	.cell {
		content-visibility: auto;
		contain-intrinsic-size: auto 156px;
	}
	.similar {
		margin-top: 2rem;
	}
	.center {
		display: grid;
		place-items: center;
		padding: 4rem 0;
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
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
