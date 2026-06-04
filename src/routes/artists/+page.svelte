<script lang="ts">
	import { activeSection } from '$lib/stores/library.svelte';
	const section = $derived(activeSection());
</script>

<section class="page">
	<h1>Artists</h1>
	<p class="dim">Browsing <strong>{section?.title}</strong> arrives in 2c.</p>
</section>
