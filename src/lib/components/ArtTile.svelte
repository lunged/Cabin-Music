<script lang="ts">
	// A square (or round, for artists) album-art tile that links to the item's detail route.
	import { artUrl } from '$lib/plex/media';
	import type { Metadata } from '$lib/plex/types';

	let { item, size = 168 }: { item: Metadata; size?: number } = $props();

	const isArtist = $derived(item.type === 'artist');

	const art = $derived.by(() => {
		const thumb =
			item.type === 'track'
				? (item.parentThumb ?? item.thumb)
				: item.type === 'playlist'
					? (item.composite ?? item.thumb)
					: item.thumb;
		return artUrl(thumb, size * 2); // 2× for crisp art on retina
	});

	const subtitle = $derived.by(() => {
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
				return `/artist/${item.ratingKey}`;
			case 'album':
				return `/album/${item.ratingKey}`;
			case 'track':
				return `/album/${item.parentRatingKey ?? item.ratingKey}`;
			case 'playlist':
				return `/playlist/${item.ratingKey}`;
			default:
				return '#';
		}
	});
</script>

<a class="tile" {href} style="--size: {size}px" title={item.title}>
	<div class="art" class:round={isArtist}>
		{#if art}
			<img src={art} alt="" loading="lazy" decoding="async" width={size} height={size} />
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
		flex: 0 0 auto;
		width: var(--size);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		color: var(--text);
		text-decoration: none;
		scroll-snap-align: start;
	}
	.art {
		width: var(--size);
		height: var(--size);
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
