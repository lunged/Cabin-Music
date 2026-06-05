<script lang="ts">
	import { page } from '$app/state';
	import { getMetadata, getChildren } from '$lib/plex/library';
	import { artUrl } from '$lib/plex/media';
	import { playList } from '$lib/stores/player.svelte';
	import TrackList from '$lib/components/TrackList.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { Metadata } from '$lib/plex/types';

	let header = $state<Metadata | null>(null);
	let tracks = $state<Metadata[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	const key = $derived(page.params.key);
	const heroArt = $derived(header ? artUrl(header.thumb, 320) : null);
	const metaTail = $derived.by(() => {
		const parts: string[] = [];
		if (header?.year) parts.push(String(header.year));
		if (tracks.length) parts.push(`${tracks.length} track${tracks.length === 1 ? '' : 's'}`);
		return parts.join(' · ');
	});

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
		tracks = [];
		try {
			const [m, children] = await Promise.all([
				getMetadata(k, signal),
				getChildren(k, { size: 300, sort: 'index:asc' }, signal)
			]);
			if (signal.aborted) return;
			header = m;
			tracks = children.items;
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
			<div class="art">
				{#if heroArt}<img src={heroArt} alt="" />{/if}
			</div>
			<div class="info">
				<p class="kind">Album</p>
				<h1>{header.title}</h1>
				{#if header.parentRatingKey}
					<a class="artist-link" href={`/artist/${header.parentRatingKey}`}>{header.parentTitle}</a>
				{:else if header.parentTitle}
					<span class="artist-link">{header.parentTitle}</span>
				{/if}
				{#if metaTail}<p class="meta dim">{metaTail}</p>{/if}
				<div class="actions">
					<button class="play-btn" onclick={() => playList(tracks, 0)} disabled={!tracks.length}>
						<Icon name="play" size={20} /> Play
					</button>
					<button
						class="shuffle-btn"
						onclick={() => playList(tracks, 0, { shuffle: true })}
						disabled={!tracks.length}
					>
						<Icon name="shuffle" size={18} /> Shuffle
					</button>
				</div>
			</div>
		</header>

		<TrackList {tracks} />
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
		width: clamp(160px, 24vw, 280px);
		aspect-ratio: 1;
		border-radius: 12px;
		overflow: hidden;
		background: var(--surface);
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
	/* Artist on its own line as a big, car-friendly tap target — clear of the Play button. */
	.artist-link {
		display: inline-flex;
		align-items: center;
		min-height: 48px;
		margin: 0.35rem 0 0 -0.7rem;
		padding: 0 0.7rem;
		border-radius: 10px;
		font-size: clamp(1.15rem, 2.2vw, 1.5rem);
		color: var(--text);
	}
	a.artist-link {
		text-decoration: none;
	}
	.meta {
		margin: 0.35rem 0 0;
		font-size: 1.05rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 1.75rem;
	}
	.play-btn,
	.shuffle-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 52px;
		padding: 0 1.5rem;
		border-radius: 999px;
		font-size: 1rem;
		font-weight: 600;
	}
	.play-btn {
		background: var(--accent);
		color: #fff;
	}
	.shuffle-btn {
		background: var(--surface);
		color: var(--text);
	}
	.play-btn:disabled,
	.shuffle-btn:disabled {
		opacity: 0.5;
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
