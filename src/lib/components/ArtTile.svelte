<script lang="ts">
	// Album-art tile that fills its container (square art via aspect-ratio; round for artists).
	// `size` controls requested image resolution, not layout width (the parent sizes it).
	// `subtitle` optionally overrides the computed subtitle (e.g. "3 years ago" for On This Day).
	import { artUrl } from '$lib/plex/media';
	import type { Metadata } from '$lib/plex/types';

	let {
		item,
		size = 168,
		subtitle: subtitleOverride
	}: { item: Metadata; size?: number; subtitle?: string } = $props();

	const isArtist = $derived(item.type === 'artist');

	const art = $derived.by(() => {
		const thumb =
			item.type === 'track'
				? (item.parentThumb ?? item.thumb)
				: item.type === 'playlist'
					? (item.composite ?? item.thumb)
					: item.thumb;
		return artUrl(thumb, size * 2);
	});

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
				return '#'; // e.g. "Mixes for You" stations — playback arrives in Phase 3
		}
	});
</script>

<a class="tile" {href} title={item.title}>
	<div class="art" class:round={isArtist}>
		{#if art}
			<img src={art} alt="" loading="lazy" decoding="async" />
		{:else}
			<div class="ph"></div>
		{/if}
	</div>
	<div class="meta" class:center={isArtist}>
		<span class="title">{item.title}</span>
		{#if subtitle}<span class="sub">{subtitle}</span>{/if}
	</div>
</a>

<style>
	.tile {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		color: var(--text);
		text-decoration: none;
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
	.art img,
	.ph {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
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
