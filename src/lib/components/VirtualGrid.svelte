<script lang="ts">
	// Responsive art-tile grid with infinite-scroll pagination. Rendering is virtualized via CSS
	// `content-visibility: auto` (offscreen tiles aren't rendered) — cheap on weak hardware.
	import { onMount } from 'svelte';
	import ArtTile from './ArtTile.svelte';
	import type { Metadata, PageResult } from '$lib/plex/types';

	let {
		load,
		pageSize = 60,
		tileMin = 156
	}: {
		load: (start: number, size: number) => Promise<PageResult>;
		pageSize?: number;
		tileMin?: number;
	} = $props();

	let items = $state<Metadata[]>([]);
	let total = $state<number | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let sentinel: HTMLDivElement | undefined = $state();

	const done = $derived(total !== null && items.length >= total);

	async function loadMore() {
		if (loading || done) return;
		loading = true;
		error = null;
		try {
			const res = await load(items.length, pageSize);
			total = res.totalSize;
			if (res.items.length === 0) {
				total = items.length; // nothing more — stop
			} else {
				items = [...items, ...res.items];
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadMore();
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) void loadMore();
			},
			{ rootMargin: '800px' }
		);
		if (sentinel) io.observe(sentinel);
		return () => io.disconnect();
	});
</script>

<div class="grid" style="--tile-min: {tileMin}px">
	{#each items as item (item.ratingKey)}
		<div class="cell"><ArtTile {item} size={tileMin} /></div>
	{/each}
</div>

{#if error}
	<p class="err">{error} <button class="retry" onclick={loadMore}>Retry</button></p>
{/if}

{#if !done}
	<div class="sentinel" bind:this={sentinel} aria-hidden="true">
		{#if loading}<div class="spinner"></div>{/if}
	</div>
{/if}

{#if total === 0}
	<p class="dim">Nothing here yet.</p>
{/if}

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(var(--tile-min), 1fr));
		gap: 1.5rem 1rem;
		align-items: start;
	}
	.cell {
		content-visibility: auto;
		contain-intrinsic-size: auto var(--tile-min);
	}
	.sentinel {
		display: grid;
		place-items: center;
		min-height: 64px;
	}
	.spinner {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: 3px solid var(--surface);
		border-top-color: var(--accent);
		animation: spin 0.9s linear infinite;
	}
	.err {
		color: var(--accent);
		font-family: ui-monospace, Menlo, monospace;
		word-break: break-word;
	}
	.retry {
		margin-left: 0.75rem;
		padding: 0.3rem 0.9rem;
		border-radius: 999px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
