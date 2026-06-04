<script lang="ts">
	import ArtTile from './ArtTile.svelte';
	import type { Metadata } from '$lib/plex/types';

	let { title, items, tileSize = 168 }: { title: string; items: Metadata[]; tileSize?: number } =
		$props();
</script>

<section class="hub">
	<h2>{title}</h2>
	<div class="row">
		{#each items as item (item.ratingKey)}
			<ArtTile {item} size={tileSize} />
		{/each}
	</div>
</section>

<style>
	.hub {
		margin-bottom: 2rem;
	}
	h2 {
		margin: 0 0 0.85rem;
		font-size: clamp(1.05rem, 1.8vw, 1.3rem);
		font-weight: 600;
	}
	.row {
		display: flex;
		gap: 1rem;
		overflow-x: auto;
		overflow-y: hidden;
		padding-bottom: 0.5rem;
		scroll-snap-type: x proximity;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
	}
	.row::-webkit-scrollbar {
		display: none;
	}
</style>
