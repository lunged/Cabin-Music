<script lang="ts">
	import { player, currentTrack, toggle, next, prev, seek, toggleExpanded } from '$lib/stores/player.svelte';
	import Art from './Art.svelte';
	import Icon from './Icon.svelte';
	import Seekbar from './Seekbar.svelte';
	import NowPlaying from './NowPlaying.svelte';

	const track = $derived(currentTrack());
	const artThumb = $derived(track?.parentThumb ?? track?.thumb ?? null);
	const artistName = $derived(track?.grandparentTitle ?? track?.parentTitle ?? '');
	const artistHref = $derived(track?.grandparentRatingKey ? `/artist/${track.grandparentRatingKey}` : null);

	function collapse() {
		player.expanded = false;
	}
</script>

{#if track}
	<div class="bar">
		<div class="meta">
			<button class="art" onclick={toggleExpanded} aria-label="Open now playing">
				<Art thumb={artThumb} w={140} />
			</button>
			<div class="txt">
				<button class="title" onclick={toggleExpanded}>{track.title}</button>
				{#if artistHref}
					<a class="artist" href={artistHref} onclick={collapse}>{artistName}</a>
				{:else}
					<span class="artist">{artistName}</span>
				{/if}
			</div>
		</div>

		<div class="controls">
			<button class="ctl" onclick={prev} aria-label="Previous"><Icon name="prev" size={26} /></button>
			<button class="play" onclick={toggle} aria-label={player.playing ? 'Pause' : 'Play'}>
				<Icon name={player.playing ? 'pause' : 'play'} size={30} />
			</button>
			<button class="ctl" onclick={() => next()} aria-label="Next"><Icon name="next" size={26} /></button>
		</div>

		<div class="seek">
			<Seekbar current={player.currentTime} duration={player.duration} onseek={seek} />
		</div>
	</div>

	{#if player.expanded}
		<NowPlaying />
	{/if}
{/if}

<style>
	.bar {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 14px 1.5rem;
		background: var(--bg-elevated);
		border-top: 1px solid var(--border);
	}
	.meta {
		flex: 1 1 0;
		min-width: 0;
		max-width: 360px;
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}
	.art {
		flex: 0 0 auto;
		width: 64px;
		height: 64px;
		border-radius: 8px;
		overflow: hidden;
		background: var(--surface);
		padding: 0;
	}
	.txt {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		min-width: 0;
	}
	.title {
		display: block;
		max-width: 100%;
		font-weight: 600;
		color: var(--text);
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.artist {
		display: block;
		max-width: 100%;
		font-size: 0.9rem;
		color: var(--text-dim);
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.controls {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.ctl {
		display: grid;
		place-items: center;
		width: 72px;
		height: 72px;
		border-radius: 50%;
		color: var(--text);
	}
	.play {
		display: grid;
		place-items: center;
		width: 96px;
		height: 96px;
		border-radius: 50%;
		background: var(--accent);
		color: #fff;
	}
	.seek {
		flex: 1 1 0;
		min-width: 120px;
	}
</style>
