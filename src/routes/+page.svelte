<script lang="ts">
	// Phase 0 placeholder screen — no Plex integration yet (spec §9).
	const phase = 'Phase 0 — Skeleton';
</script>

<main class="hero">
	<div class="mark" aria-hidden="true">
		<span class="dot"></span>
	</div>

	<h1>Cabin</h1>
	<p class="tagline">Plex music, made for the car.</p>

	<div class="status" role="status">
		<span class="badge">{phase}</span>
		<span class="dim">Not paired yet — Plex pairing arrives in Phase 1.</span>
	</div>
</main>

<style>
	.hero {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 6vh 8vw;
		text-align: center;
	}

	.mark {
		display: grid;
		place-items: center;
		width: clamp(88px, 12vw, 140px);
		height: clamp(88px, 12vw, 140px);
		margin-bottom: 1.5rem;
		border-radius: 50%;
		background: var(--surface);
	}

	.dot {
		width: 28%;
		height: 28%;
		border-radius: 50%;
		background: var(--accent);
	}

	h1 {
		margin: 0;
		font-size: clamp(3rem, 7vw, 6rem);
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	.tagline {
		margin: 0.25rem 0 0;
		font-size: clamp(1.1rem, 2.2vw, 1.6rem);
		color: var(--text-dim);
	}

	.status {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		margin-top: 2.5rem;
	}

	.badge {
		padding: 0.5rem 1rem;
		border-radius: 999px;
		background: var(--bg-elevated);
		font-size: 0.95rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.dim {
		color: var(--text-dim);
		font-size: 0.95rem;
	}
</style>
