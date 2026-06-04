<script lang="ts">
	import NavRail from './NavRail.svelte';
	let { children } = $props();
</script>

<div class="shell">
	<NavRail />
	<main class="content">
		{@render children()}
	</main>
</div>

<style>
	.shell {
		display: flex;
		height: 100dvh;
	}
	.content {
		flex: 1 1 auto;
		min-width: 0;
		height: 100dvh;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
</style>
