<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import DebugPanel from '$lib/components/DebugPanel.svelte';
	import { bootSession } from '$lib/plex/discovery';

	let { children } = $props();

	// Boot the session once on mount: pair → discover → connect, or reconnect from cache.
	$effect(() => {
		const ctrl = new AbortController();
		void bootSession(ctrl.signal);
		return () => ctrl.abort();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<DebugPanel />
