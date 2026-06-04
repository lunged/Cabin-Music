<script lang="ts">
	let {
		current,
		duration,
		onseek
	}: { current: number; duration: number; onseek: (t: number) => void } = $props();

	let dragging = $state(false);
	let dragValue = $state(0);
	let bar: HTMLDivElement | undefined = $state();

	const shown = $derived(dragging ? dragValue : current);
	const pct = $derived(duration > 0 ? Math.min(100, (shown / duration) * 100) : 0);

	function posToTime(clientX: number): number {
		if (!bar || duration <= 0) return 0;
		const r = bar.getBoundingClientRect();
		return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * duration;
	}
	function onPointerDown(e: PointerEvent) {
		if (duration <= 0) return;
		dragging = true;
		dragValue = posToTime(e.clientX);
		try {
			(e.currentTarget as Element).setPointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	}
	function onPointerMove(e: PointerEvent) {
		if (dragging) dragValue = posToTime(e.clientX);
	}
	function commit() {
		if (dragging) {
			onseek(dragValue);
			dragging = false;
		}
	}
	function fmt(s: number): string {
		if (!Number.isFinite(s) || s < 0) return '0:00';
		const m = Math.floor(s / 60);
		return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
	}
</script>

<div class="seek">
	<span class="t">{fmt(shown)}</span>
	<div
		class="track"
		bind:this={bar}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={commit}
		onpointercancel={commit}
		role="slider"
		aria-label="Seek"
		aria-valuemin="0"
		aria-valuemax={Math.round(duration)}
		aria-valuenow={Math.round(shown)}
		tabindex="0"
	>
		<div class="fill" style="width: {pct}%"></div>
		<div class="knob" style="left: {pct}%"></div>
	</div>
	<span class="t">{fmt(duration)}</span>
</div>

<style>
	.seek {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
	}
	.t {
		flex: 0 0 auto;
		font-size: 0.8rem;
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
		min-width: 3ch;
		text-align: center;
	}
	.track {
		position: relative;
		flex: 1 1 auto;
		height: 16px;
		display: flex;
		align-items: center;
		cursor: pointer;
		touch-action: none;
	}
	.track::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		height: 5px;
		border-radius: 999px;
		background: var(--slider-track);
	}
	.fill {
		position: absolute;
		left: 0;
		height: 5px;
		border-radius: 999px;
		background: var(--accent);
	}
	.knob {
		position: absolute;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--accent);
		transform: translateX(-50%);
	}
</style>
