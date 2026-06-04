<script lang="ts">
	// Album-art tile that fills its container (square; round for artists). When `onActivate` is
	// provided it renders as a button (e.g. a "Mixes for you" tile that starts radio); otherwise a link.
	import Art from './Art.svelte';
	import type { Metadata } from '$lib/plex/types';

	let {
		item,
		size = 168,
		subtitle: subtitleOverride,
		onActivate
	}: { item: Metadata; size?: number; subtitle?: string; onActivate?: () => void } = $props();

	const isArtist = $derived(item.type === 'artist');

	const thumb = $derived(
		item.type === 'track'
			? (item.parentThumb ?? item.thumb ?? item.grandparentThumb)
			: (item.thumb ?? item.composite ?? item.art ?? item.parentThumb ?? item.grandparentThumb)
	);

	const subtitle = $derived.by(() => {
		if (subtitleOverride !== undefined) return subtitleOverride;
		switch (item.type) {
			case 'track':
				return item.grandparentTitle ?? item.parentTitle ?? '';
			case 'album':
				return item.parentTitle ?? (item.year ? String(item.year) : '');
			case 'playlist':
				return item.leafCount ? `${item.leafCount} tracks` : 'Playlist';
			default:
				return '';
		}
	});

	const href = $derived.by(() => {
		switch (item.type) {
			case 'artist':
				return item.ratingKey ? `/artist/${item.ratingKey}` : '#';
			case 'album':
				return item.ratingKey ? `/album/${item.ratingKey}` : '#';
			case 'track': {
				const k = item.parentRatingKey ?? item.ratingKey;
				return k ? `/album/${k}` : '#';
			}
			case 'playlist':
				return item.ratingKey ? `/playlist/${item.ratingKey}` : '#';
			default:
				return '#';
		}
	});
</script>

{#snippet body()}
	<div class="art" class:round={isArtist}>
		<Art {thumb} w={size * 2} />
	</div>
	<div class="meta" class:center={isArtist}>
		<span class="title">{item.title}</span>
		{#if subtitle}<span class="sub">{subtitle}</span>{/if}
	</div>
{/snippet}

{#if onActivate}
	<button class="tile" onclick={onActivate} title={item.title}>{@render body()}</button>
{:else}
	<a class="tile" {href} title={item.title}>{@render body()}</a>
{/if}

<style>
	.tile {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		color: var(--text);
		text-decoration: none;
		text-align: left;
	}
	.art {
		width: 100%;
		aspect-ratio: 1 / 1;
		border-radius: 10px;
		overflow: hidden;
		background: var(--surface);
	}
	.art.round {
		border-radius: 50%;
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.meta.center {
		text-align: center;
	}
	.title {
		font-size: 0.95rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sub {
		font-size: 0.85rem;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
