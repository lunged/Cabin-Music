<script lang="ts">
	import type { Metadata } from '$lib/plex/types';
	import { player, currentTrack, playList, enqueueLast } from '$lib/stores/player.svelte';
	import { isLoved, toggleLove } from '$lib/stores/ratings.svelte';
	import Icon from './Icon.svelte';

	let { tracks, showArtist = false }: { tracks: Metadata[]; showArtist?: boolean } = $props();

	const currentKey = $derived(currentTrack()?.ratingKey);

	// Brief "added to queue" confirmation per row (plus → check, then back).
	let added = $state<Record<string, boolean>>({});
	function addToQueue(t: Metadata) {
		enqueueLast(t);
		const rk = t.ratingKey;
		added[rk] = true;
		setTimeout(() => (added[rk] = false), 1300);
	}

	function fmt(ms?: number): string {
		if (!ms) return '';
		const s = Math.round(ms / 1000);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}
</script>

<ol class="tracks">
	{#each tracks as t, i (t.ratingKey)}
		{@const active = t.ratingKey === currentKey}
		<li class:active>
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
			<button
				class="love"
				class:on={isLoved(t)}
				onclick={() => toggleLove(t)}
				aria-label={isLoved(t) ? 'Unlove' : 'Love'}
			>
				<Icon name={isLoved(t) ? 'heart-filled' : 'heart'} size={20} />
			</button>
			<button
				class="add"
				class:added={added[t.ratingKey]}
				onclick={() => addToQueue(t)}
				aria-label="Add to queue"
			>
				<Icon name={added[t.ratingKey] ? 'check' : 'plus'} size={20} />
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
	li {
		display: flex;
		align-items: stretch;
		gap: 0.25rem;
		border-radius: 10px;
	}
	li:nth-child(odd) {
		background: var(--stripe);
	}
	.track {
		flex: 1 1 auto;
		min-width: 0;
		display: grid;
		grid-template-columns: 2.5rem 1fr auto;
		align-items: center;
		gap: 1rem;
		min-height: 68px;
		padding: 0.7rem 0.9rem;
		border-radius: 10px;
		color: var(--text);
		text-align: left;
		font-size: 1.05rem;
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
		font-size: 1.1rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.artist {
		font-size: 0.92rem;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.dur {
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
	}
	.love {
		flex: 0 0 auto;
		width: 48px;
		display: grid;
		place-items: center;
		color: var(--text-dim);
		border-radius: 10px;
	}
	.love.on {
		color: var(--accent);
	}
	/* Add-to-queue: a circular tap target, set well apart from the heart so it's hard to mis-tap. */
	.add {
		flex: 0 0 auto;
		align-self: center;
		width: 52px;
		height: 52px;
		margin-left: 1rem;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: var(--surface);
		color: var(--text);
		transition:
			background 0.15s ease,
			color 0.15s ease,
			transform 0.15s ease;
	}
	/* Brief confirmation flash when a track is added to the queue. */
	.add.added {
		background: var(--accent);
		color: #fff;
		transform: scale(1.08);
	}
</style>
