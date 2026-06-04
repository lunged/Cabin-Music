<script lang="ts">
	// Plexamp-style "Mixes for you" card: full-bleed seed-artist image, with the mix title and the
	// list of included artists overlaid on a bottom scrim. Always a button (mixes start playback).
	import Art from './Art.svelte';
	import type { Metadata } from '$lib/plex/types';

	let {
		item,
		subtitle,
		size = 220,
		onActivate
	}: { item: Metadata; subtitle?: string; size?: number; onActivate?: () => void } = $props();

	const thumb = $derived(item.thumb ?? item.grandparentThumb ?? null);
</script>

<button class="card" onclick={onActivate} title={item.title}>
	<div class="bg"><Art {thumb} w={size * 2} /></div>
	<div class="scrim"></div>
	<div class="txt">
		<span class="t">{item.title}</span>
		{#if subtitle}<span class="s">{subtitle}</span>{/if}
	</div>
</button>

<style>
	.card {
		position: relative;
		width: 100%;
		aspect-ratio: 1 / 1;
		border-radius: 14px;
		overflow: hidden;
		display: block;
		text-align: left;
		color: #fff;
		background: var(--surface);
	}
	.bg {
		position: absolute;
		inset: 0;
	}
	.scrim {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to top,
			rgba(0, 0, 0, 0.82) 0%,
			rgba(0, 0, 0, 0.4) 38%,
			rgba(0, 0, 0, 0) 66%
		);
	}
	.txt {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.9rem 1rem;
	}
	.t {
		font-size: 1.25rem;
		font-weight: 700;
		line-height: 1.15;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.s {
		font-size: 0.92rem;
		color: rgba(255, 255, 255, 0.82);
		line-height: 1.25;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
