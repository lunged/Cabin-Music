<script lang="ts">
	// Status gate (Phase 1). Boot happens in +layout.svelte; this picks the screen for the state.
	import { session } from '$lib/stores/session.svelte';
	import { bootSession } from '$lib/plex/discovery';
	import { signOut } from '$lib/plex/auth';
	import PairScreen from '$lib/components/PairScreen.svelte';
	import ConnectedScreen from '$lib/components/ConnectedScreen.svelte';

	const bootingLabel = $derived(
		session.status === 'discovering'
			? 'Finding your server…'
			: session.status === 'authenticated'
				? 'Connecting…'
				: 'Starting…'
	);

	function retryDiscovery() {
		void bootSession();
	}
</script>

{#if session.status === 'connected'}
	<ConnectedScreen />
{:else if session.status === 'unauthenticated' || session.status === 'pairing'}
	<PairScreen />
{:else if session.status === 'error'}
	<main class="state">
		<h1>Couldn't connect</h1>
		<p class="msg">{session.error?.message}</p>
		{#if session.error?.detail}<p class="detail">{session.error.detail}</p>{/if}
		<div class="actions">
			<button class="primary" onclick={retryDiscovery}>Try again</button>
			<button class="ghost" onclick={signOut}>Sign out</button>
		</div>
	</main>
{:else}
	<!-- booting | authenticated | discovering -->
	<main class="state">
		<div class="spinner" aria-hidden="true"></div>
		<p class="msg">{bootingLabel}</p>
	</main>
{/if}

<style>
	.state {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 6vh 8vw;
		text-align: center;
	}
	h1 {
		margin: 0;
		font-size: clamp(2rem, 4.5vw, 3.25rem);
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.msg {
		margin: 0;
		font-size: clamp(1rem, 2vw, 1.35rem);
		color: var(--text);
	}
	.detail {
		margin: 0;
		max-width: 680px;
		color: var(--text-dim);
		font-size: 0.95rem;
		word-break: break-word;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin-top: 1rem;
	}
	.primary,
	.ghost {
		min-height: var(--tap-min);
		padding: 0 2rem;
		border-radius: var(--radius);
		font-size: 1.1rem;
		font-weight: 600;
	}
	.primary {
		background: var(--accent);
		color: #fff;
	}
	.ghost {
		background: var(--surface);
		color: var(--text);
	}
	.spinner {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		border: 4px solid var(--surface);
		border-top-color: var(--accent);
		animation: spin 0.9s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
