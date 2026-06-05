<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import DebugPanel from '$lib/components/DebugPanel.svelte';
	import ConnectionGate from '$lib/components/ConnectionGate.svelte';
	import AppShell from '$lib/components/AppShell.svelte';
	import LibraryChooser from '$lib/components/LibraryChooser.svelte';
	import { bootSession } from '$lib/plex/discovery';
	import { initTheme } from '$lib/stores/theme.svelte';
	import { session } from '$lib/stores/session.svelte';
	import { library, loadSections } from '$lib/stores/library.svelte';

	let { children } = $props();

	onMount(() => {
		initTheme();
		// Boot the session once: pair → discover → connect, or reconnect from cache.
		const ctrl = new AbortController();
		void bootSession(ctrl.signal);
		return () => ctrl.abort();
	});

	// Once connected, load the server's music libraries (once).
	$effect(() => {
		if (session.status === 'connected' && !library.loaded && !library.loading) {
			void loadSections();
		}
	});
</script>

{#if session.status !== 'connected'}
	<ConnectionGate />
{:else if !library.loaded}
	<main class="boot">
		<div class="spinner" aria-hidden="true"></div>
		<p>Loading your libraries…</p>
	</main>
{:else if library.error}
	<main class="boot"><p class="err">{library.error}</p></main>
{:else if !library.activeId}
	<LibraryChooser />
{:else}
	<AppShell>
		{@render children()}
	</AppShell>
{/if}

<DebugPanel />

<style>
	.boot {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		color: var(--text-dim);
	}
	.err {
		color: var(--accent);
		max-width: 600px;
		text-align: center;
		padding: 0 8vw;
	}
	.spinner {
		width: 44px;
		height: 44px;
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
