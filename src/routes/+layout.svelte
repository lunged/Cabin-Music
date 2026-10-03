<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import DebugPanel from '$lib/components/DebugPanel.svelte';
	import ConnectionGate from '$lib/components/ConnectionGate.svelte';
	import AccessGate from '$lib/components/AccessGate.svelte';
	import AppShell from '$lib/components/AppShell.svelte';
	import LibraryChooser from '$lib/components/LibraryChooser.svelte';
	import { bootSession } from '$lib/plex/discovery';
	import { initTheme } from '$lib/stores/theme.svelte';
	import { initDrive } from '$lib/stores/drive.svelte';
	import { initScale } from '$lib/stores/scale.svelte';
	import { session } from '$lib/stores/session.svelte';
	import { gate, checkGate } from '$lib/stores/gate.svelte';
	import { library, loadSections } from '$lib/stores/library.svelte';

	let { children } = $props();
	let bootCtrl: AbortController | null = null;
	let booted = false;

	onMount(() => {
		initTheme();
		initDrive();
		initScale();
		// Check the optional passphrase gate first; booting waits until it's cleared (below).
		bootCtrl = new AbortController();
		void checkGate(bootCtrl.signal);
		return () => bootCtrl?.abort();
	});

	// Boot the session once the gate is cleared: pair → discover → connect, or reconnect from cache.
	$effect(() => {
		if (gate.checked && !gate.required && !booted && bootCtrl) {
			booted = true;
			void bootSession(bootCtrl.signal);
		}
	});

	// Once connected, load the server's music libraries (once).
	$effect(() => {
		if (session.status === 'connected' && !library.loaded && !library.loading) {
			void loadSections();
		}
	});
</script>

{#if !gate.checked}
	<main class="boot"><div class="spinner" aria-hidden="true"></div></main>
{:else if gate.required}
	<AccessGate />
{:else if session.status !== 'connected'}
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
		max-width: 37.5rem;
		text-align: center;
		padding: 0 8vw;
	}
	.spinner {
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 50%;
		border: 0.25rem solid var(--surface);
		border-top-color: var(--accent);
		animation: spin 0.9s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
