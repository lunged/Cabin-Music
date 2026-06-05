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
		toggleExpanded,
		jumpTo,
		removeAt,
		moveQueueItem
	} from '$lib/stores/player.svelte';
	import Art from './Art.svelte';
	import Icon from './Icon.svelte';
	import Seekbar from './Seekbar.svelte';
	import { artUrl } from '$lib/plex/media';
	import { isLoved, toggleLove } from '$lib/stores/ratings.svelte';

	let showQueue = $state(false);

	const track = $derived(currentTrack());
	const artThumb = $derived(track?.parentThumb ?? track?.thumb ?? null);
	const bgArt = $derived(artThumb ? artUrl(artThumb, 480) : null); // blurred UltraBlur backdrop
	const artistHref = $derived(
		track?.grandparentRatingKey ? `/artist/${track.grandparentRatingKey}` : null
	);
	const albumHref = $derived(track?.parentRatingKey ? `/album/${track.parentRatingKey}` : null);
	const loved = $derived(isLoved(track));

	function collapse() {
		player.expanded = false;
	}

	// --- swipe-down to dismiss ---
	const DISMISS_PX = 110;
	let dragY = $state(0);
	let dragging = $state(false);
	let axisLocked = false;
	let startX = 0;
	let startY = 0;

	function onDown(e: PointerEvent) {
		if (showQueue) return; // queue view scrolls vertically — don't hijack it
		// Ignore drags that begin on an interactive control (buttons, seekbar, links).
		if ((e.target as Element).closest('button, a, input, [role="slider"], .queue')) return;
		startX = e.clientX;
		startY = e.clientY;
		dragging = true;
		axisLocked = false;
	}
	function onMove(e: PointerEvent) {
		if (!dragging) return;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		if (!axisLocked) {
			if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
			axisLocked = true;
			if (Math.abs(dx) > Math.abs(dy)) {
				dragging = false; // horizontal intent → not a dismiss
				return;
			}
		}
		dragY = Math.max(0, dy); // follow the finger downward only
	}
	function onUp() {
		if (!dragging) return;
		dragging = false;
		const dismiss = dragY > DISMISS_PX;
		dragY = 0;
		if (dismiss) toggleExpanded();
	}
</script>

<div
	class="np"
	class:queueview={showQueue}
	role="dialog"
	aria-label="Now playing"
	tabindex="-1"
	style="transform: translateY({dragY}px); transition: transform {dragging ? '0s' : '0.28s ease'}; touch-action: {showQueue
		? 'auto'
		: 'none'};"
	onpointerdown={onDown}
	onpointermove={onMove}
	onpointerup={onUp}
	onpointercancel={onUp}
>
	{#if bgArt}
		<div class="np-bg" style="background-image: url('{bgArt}')"></div>
		<div class="np-scrim"></div>
	{/if}
	<button class="close" onclick={toggleExpanded} aria-label="Close"><Icon name="chevron-down" size={32} /></button>
	<button class="queuebtn" class:on={showQueue} onclick={() => (showQueue = !showQueue)} aria-label="Queue">
		<Icon name="queue" size={26} />
	</button>

	{#if showQueue}
		<div class="queue">
			<h2>Up Next</h2>
			<ol>
				{#each player.queue as t, i (t.playQueueItemID ?? `${t.ratingKey}:${i}`)}
					<li class:active={i === player.index}>
						<button class="qmain" onclick={() => jumpTo(i)}>
							<span class="qidx">
								{#if i === player.index}<Icon name={player.playing ? 'pause' : 'play'} size={14} />{:else}{i + 1}{/if}
							</span>
							<span class="qtext">
								<span class="qtitle">{t.title}</span>
								{#if t.grandparentTitle}<span class="qartist">{t.grandparentTitle}</span>{/if}
							</span>
						</button>
						<div class="qactions">
							<button onclick={() => moveQueueItem(i, i - 1)} disabled={i === 0} aria-label="Move up">
								<Icon name="arrow-up" size={20} />
							</button>
							<button onclick={() => moveQueueItem(i, i + 1)} disabled={i === player.queue.length - 1} aria-label="Move down">
								<Icon name="arrow-down" size={20} />
							</button>
							<button onclick={() => removeAt(i)} aria-label="Remove from queue">
								<Icon name="x" size={20} />
							</button>
						</div>
					</li>
				{/each}
			</ol>
		</div>
	{:else}
		<div class="art"><Art thumb={artThumb} w={640} /></div>

		<div class="info">
			<h1>{track?.title}</h1>
			<p>{#if artistHref}<a class="artist" href={artistHref} onclick={collapse}>{track?.grandparentTitle}</a>{:else}<span class="artist">{track?.grandparentTitle ?? ''}</span>{/if}{#if track?.parentTitle}<span class="sep">·</span>{#if albumHref}<a class="album" href={albumHref} onclick={collapse}>{track.parentTitle}</a>{:else}<span class="album">{track.parentTitle}</span>{/if}{/if}</p>
		</div>

		<div class="seek"><Seekbar current={player.currentTime} duration={player.duration} onseek={seek} /></div>
	{/if}

	<div class="controls">
		<button class="sec" class:on={loved} onclick={() => toggleLove(track)} aria-label={loved ? 'Unlove' : 'Love'}>
			<Icon name={loved ? 'heart-filled' : 'heart'} size={26} />
		</button>
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
		overflow: hidden;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: clamp(1rem, 2.5vh, 2rem);
		padding: 5.5rem clamp(1.5rem, 4vw, 3rem) clamp(1.5rem, 4vw, 3rem);
	}
	/* UltraBlur: the album art, scaled up + heavily blurred, with a theme-aware scrim for legibility. */
	.np-bg {
		position: absolute;
		inset: 0;
		z-index: -1;
		background-size: cover;
		background-position: center;
		filter: blur(64px) saturate(1.5);
		transform: scale(1.3);
		opacity: 0.7;
	}
	.np-scrim {
		position: absolute;
		inset: 0;
		z-index: -1;
		background: var(--np-scrim);
	}
	/* When the queue is open, content flows from the top and the list scrolls. */
	.np.queueview {
		justify-content: flex-start;
		gap: 1rem;
	}
	.close,
	.queuebtn {
		position: absolute;
		width: 64px;
		height: 64px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		color: var(--text);
		background: var(--surface);
		z-index: 1;
	}
	.close {
		top: 1.25rem;
		left: 1.25rem;
	}
	.queuebtn {
		bottom: 1.25rem;
		left: 1.25rem;
		color: var(--text-dim);
	}
	.queuebtn.on {
		color: var(--accent);
	}
	.art {
		width: min(46vh, 440px);
		aspect-ratio: 1;
		border-radius: 18px;
		overflow: hidden;
		background: var(--surface);
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
		text-decoration: none;
	}
	.info .artist {
		color: var(--text);
	}
	.info .album {
		color: var(--text-dim);
	}
	.info .sep {
		margin: 0 0.55rem;
		color: var(--text-dim);
	}
	.seek {
		width: min(640px, 92vw);
	}

	/* Queue panel */
	.queue {
		width: 100%;
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}
	.queue h2 {
		margin: 0 0 0.5rem;
		font-size: 1.1rem;
		color: var(--text-dim);
	}
	.queue ol {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.queue li {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		border-radius: 10px;
	}
	.queue li:nth-child(odd) {
		background: var(--stripe);
	}
	.qmain {
		flex: 1 1 auto;
		min-width: 0;
		display: grid;
		grid-template-columns: 2rem 1fr;
		align-items: center;
		gap: 0.85rem;
		min-height: 68px;
		padding: 0.65rem 0.75rem;
		color: var(--text);
		text-align: left;
		font-size: 1.05rem;
	}
	.queue li.active .qmain,
	.queue li.active .qartist {
		color: var(--accent);
	}
	.qidx {
		color: var(--text-dim);
		display: grid;
		place-items: center;
		font-variant-numeric: tabular-nums;
	}
	.queue li.active .qidx {
		color: var(--accent);
	}
	.qtext {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.qtitle,
	.qartist {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.qtitle {
		font-size: 1.1rem;
	}
	.qartist {
		font-size: 0.92rem;
		color: var(--text-dim);
	}
	.qactions {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
	}
	.qactions button {
		width: 52px;
		height: 52px;
		display: grid;
		place-items: center;
		color: var(--text-dim);
		border-radius: 8px;
	}
	.qactions button:disabled {
		opacity: 0.3;
	}

	.controls {
		flex: 0 0 auto;
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
