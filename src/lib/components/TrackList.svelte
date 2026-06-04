<script lang="ts">
	import type { Metadata } from '$lib/plex/types';
	import { player, currentTrack, playList } from '$lib/stores/player.svelte';
	import Icon from './Icon.svelte';

	let { tracks, showArtist = false }: { tracks: Metadata[]; showArtist?: boolean } = $props();

	const currentKey = $derived(currentTrack()?.ratingKey);

	function fmt(ms?: number): string {
		if (!ms) return '';
		const s = Math.round(ms / 1000);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}
</script>

<ol class="tracks">
	{#each tracks as t, i (t.ratingKey)}
		{@const active = t.ratingKey === currentKey}
		<li>
			<button class="track" class:active onclick={() => playList(tracks, i)}>
				<span class="idx">
					{#if active}
						<Icon name={player.playing ? 'pause' : 'play'} size={14} />
					{:else}
						{t.index ?? i + 1}
					{/if}
				</span>
				<span class="main">
					<span class="title">{t.title}</span>
					{#if showArtist && t.grandparentTitle}<span class="artist">{t.grandparentTitle}</span>{/if}
				</span>
				<span class="dur">{fmt(t.duration)}</span>
			</button>
		</li>
	{/each}
</ol>

<style>
	.tracks {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.track {
		display: grid;
		grid-template-columns: 2.5rem 1fr auto;
		align-items: center;
		gap: 1rem;
		width: 100%;
		min-height: 56px;
		padding: 0.4rem 0.75rem;
		border-radius: 10px;
		color: var(--text);
		text-align: left;
	}
	li:nth-child(odd) .track {
		background: var(--bg-elevated);
	}
	.track.active,
	.track.active .idx,
	.track.active .artist {
		color: var(--accent);
	}
	.idx {
		color: var(--text-dim);
		display: grid;
		place-items: center;
		font-variant-numeric: tabular-nums;
	}
	.main {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.title {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.artist {
		font-size: 0.85rem;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.dur {
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
	}
</style>
