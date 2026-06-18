<script lang="ts">
	import { onMount } from 'svelte';
	import NavRail from './NavRail.svelte';
	import NowPlayingBar from './NowPlayingBar.svelte';
	import { restore } from '$lib/stores/player.svelte';

	let { children } = $props();

	// Restore the last queue (paused) once we're connected and the shell is mounted.
	onMount(() => restore());
</script>

<div class="app">
	<div class="row">
		<NavRail />
		<main class="content">
			{@render children()}
		</main>
	</div>
	<NowPlayingBar />
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		height: 100dvh;
	}
	.row {
		display: flex;
		flex: 1 1 auto;
		min-height: 0;
	}
	/* Right-hand drive: move the nav rail to the side nearest the driver (the right). */
	:global([data-drive='rhd']) .row {
		flex-direction: row-reverse;
	}
	.content {
		flex: 1 1 auto;
		min-width: 0;
		height: 100%;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
</style>
