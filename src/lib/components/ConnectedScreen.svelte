<script lang="ts">
	// Phase 1 end-state. Browsing (Phase 2) will replace this with the library.
	import { session } from '$lib/stores/session.svelte';
</script>

<main class="connected">
	<div class="check" aria-hidden="true">
		<span class="dot"></span>
	</div>
	<h1>Connected</h1>
	<p class="server">{session.active?.serverName ?? 'Plex server'}</p>

	{#if session.active}
		<div class="meta">
			<span class="badge" class:relay={session.active.connType === 'relay'}>{session.active.connType}</span>
			<span class="uri">{session.active.baseUri}</span>
		</div>
	{/if}

	<p class="dim">Library browsing arrives in Phase 2.</p>
	<p class="hint">Long-press the top-left corner for diagnostics.</p>
</main>

<style>
	.connected {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 6vh 8vw;
		text-align: center;
	}
	.check {
		display: grid;
		place-items: center;
		width: clamp(72px, 9vw, 104px);
		height: clamp(72px, 9vw, 104px);
		margin-bottom: 1rem;
		border-radius: 50%;
		background: var(--surface);
	}
	.check .dot {
		width: 30%;
		height: 30%;
		border-radius: 50%;
		background: var(--accent);
	}
	h1 {
		margin: 0;
		font-size: clamp(2.25rem, 5vw, 3.5rem);
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.server {
		margin: 0.25rem 0 0.75rem;
		font-size: clamp(1.1rem, 2.2vw, 1.6rem);
		color: var(--text);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		font-family: ui-monospace, Menlo, monospace;
		font-size: 0.9rem;
		color: var(--text-dim);
	}
	.badge {
		padding: 0.2rem 0.7rem;
		border-radius: 999px;
		background: var(--bg-elevated);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 0.75rem;
	}
	.badge.relay {
		background: var(--accent);
		color: #fff;
	}
	.uri {
		word-break: break-all;
	}
	.dim {
		margin-top: 1.5rem;
		color: var(--text-dim);
	}
	.hint {
		margin: 0.25rem 0 0;
		color: var(--text-dim);
		font-size: 0.85rem;
		opacity: 0.7;
	}
</style>
