<script lang="ts">
	// Display-only track list (playback arrives in Phase 3).
	import type { Metadata } from '$lib/plex/types';

	let { tracks, showArtist = false }: { tracks: Metadata[]; showArtist?: boolean } = $props();

	function fmt(ms?: number): string {
		if (!ms) return '';
		const s = Math.round(ms / 1000);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}
</script>

<ol class="tracks">
	{#each tracks as t (t.ratingKey)}
		<li class="track">
			<span class="idx">{t.index ?? ''}</span>
			<span class="main">
				<span class="title">{t.title}</span>
				{#if showArtist && t.grandparentTitle}<span class="artist">{t.grandparentTitle}</span>{/if}
			</span>
			<span class="dur">{fmt(t.duration)}</span>
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
		min-height: 56px;
		padding: 0.4rem 0.75rem;
		border-radius: 10px;
	}
	.track:nth-child(odd) {
		background: var(--bg-elevated);
	}
	.idx {
		color: var(--text-dim);
		text-align: right;
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
