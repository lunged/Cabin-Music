<script lang="ts">
	import ArtTile from './ArtTile.svelte';
	import MixCard from './MixCard.svelte';
	import type { Metadata } from '$lib/plex/types';

	let {
		title,
		items,
		tileSize = 168,
		variant = 'tile',
		subtitleFor,
		onItem
	}: {
		title: string;
		items: Metadata[];
		tileSize?: number;
		variant?: 'tile' | 'mix';
		subtitleFor?: (item: Metadata) => string;
		onItem?: (item: Metadata) => void;
	} = $props();
</script>

<section class="hub">
	<h2>{title}</h2>
	<div class="row">
		{#each items as item (item.ratingKey ?? item.key ?? item.title)}
			<div class="slot" style="width: {tileSize}px">
				{#if variant === 'mix'}
					<MixCard
						{item}
						size={tileSize}
						subtitle={subtitleFor ? subtitleFor(item) : undefined}
						onActivate={onItem ? () => onItem(item) : undefined}
					/>
				{:else}
					<ArtTile
						{item}
						size={tileSize}
						subtitle={subtitleFor ? subtitleFor(item) : undefined}
						onActivate={onItem ? () => onItem(item) : undefined}
					/>
				{/if}
			</div>
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
	.slot {
		flex: 0 0 auto;
		scroll-snap-align: start;
	}
</style>
