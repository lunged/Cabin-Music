<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import DebugPanel from '$lib/components/DebugPanel.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { bootSession } from '$lib/plex/discovery';
	import { initTheme } from '$lib/stores/theme.svelte';

	let { children } = $props();

	onMount(() => {
		initTheme();
		// Boot the session once: pair → discover → connect, or reconnect from cache.
		const ctrl = new AbortController();
		void bootSession(ctrl.signal);
		return () => ctrl.abort();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<ThemeToggle />
<DebugPanel />
