<script lang="ts">
	import {
		player,
		currentTrack,
		toggle,
		next,
		prev,
		seek,
		cycleRepeat,
		toggleShuffle,
		toggleExpanded
	} from '$lib/stores/player.svelte';
	import { artUrl } from '$lib/plex/media';
	import Icon from './Icon.svelte';
	import Seekbar from './Seekbar.svelte';

	const track = $derived(currentTrack());
	const art = $derived(track ? artUrl(track.parentThumb ?? track.thumb, 640) : null);
	const artistHref = $derived(
		track?.grandparentRatingKey ? `/artist/${track.grandparentRatingKey}` : null
	);

	function collapse() {
		player.expanded = false;
	}
</script>

<div class="np" role="dialog" aria-label="Now playing">
	<button class="close" onclick={toggleExpanded} aria-label="Close"><Icon name="chevron-down" size={32} /></button>

	<div class="art">{#if art}<img src={art} alt="" />{/if}</div>

	<div class="info">
		<h1>{track?.title}</h1>
		<p>
			{#if artistHref}<a href={artistHref} onclick={collapse}>{track?.grandparentTitle}</a>{:else}{track?.grandparentTitle ?? ''}{/if}{#if track?.parentTitle}
				· {track.parentTitle}{/if}
		</p>
	</div>

	<div class="seek"><Seekbar current={player.currentTime} duration={player.duration} onseek={seek} /></div>

	<div class="controls">
		<button class="sec" class:on={player.shuffle} onclick={toggleShuffle} aria-label="Shuffle">
			<Icon name="shuffle" size={26} />
		</button>
		<button class="ctl" onclick={prev} aria-label="Previous"><Icon name="prev" size={34} /></button>
		<button class="play" onclick={toggle} aria-label={player.playing ? 'Pause' : 'Play'}>
			<Icon name={player.playing ? 'pause' : 'play'} size={42} />
		</button>
		<button class="ctl" onclick={() => next()} aria-label="Next"><Icon name="next" size={34} /></button>
		<button class="sec" class:on={player.repeat !== 'off'} onclick={cycleRepeat} aria-label="Repeat">
			<Icon name="repeat" size={26} />
			{#if player.repeat === 'one'}<span class="one">1</span>{/if}
		</button>
	</div>
</div>

<style>
	.np {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: var(--bg);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: clamp(1rem, 2.5vh, 2rem);
		padding: 5.5rem clamp(1.5rem, 4vw, 3rem) clamp(1.5rem, 4vw, 3rem);
	}
	.close {
		position: absolute;
		top: 1.25rem;
		left: 1.25rem;
		width: 64px;
		height: 64px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		color: var(--text);
		background: var(--surface);
	}
	.art {
		width: min(46vh, 440px);
		aspect-ratio: 1;
		border-radius: 18px;
		overflow: hidden;
		background: var(--surface);
	}
	.art img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.info {
		text-align: center;
		max-width: 90vw;
	}
	.info h1 {
		margin: 0;
		font-size: clamp(1.5rem, 3.5vw, 2.4rem);
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.info p {
		margin: 0.4rem 0 0;
		color: var(--text-dim);
		font-size: clamp(1rem, 2vw, 1.3rem);
	}
	.info a {
		color: var(--text);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.seek {
		width: min(640px, 92vw);
	}
	.controls {
		display: flex;
		align-items: center;
		gap: clamp(1rem, 3vw, 2rem);
	}
	.ctl {
		display: grid;
		place-items: center;
		width: 80px;
		height: 80px;
		border-radius: 50%;
		color: var(--text);
	}
	.play {
		display: grid;
		place-items: center;
		width: 112px;
		height: 112px;
		border-radius: 50%;
		background: var(--accent);
		color: #fff;
	}
	.sec {
		position: relative;
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		border-radius: 50%;
		color: var(--text-dim);
	}
	.sec.on {
		color: var(--accent);
	}
	.one {
		position: absolute;
		right: 12px;
		bottom: 10px;
		font-size: 0.7rem;
		font-weight: 700;
	}
</style>
