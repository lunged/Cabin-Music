<script lang="ts">
	import { activeSection } from '$lib/stores/library.svelte';
	const section = $derived(activeSection());
</script>

<section class="page">
	<h1>Search</h1>
	<p class="dim">Search across <strong>{section?.title}</strong> arrives in 2e.</p>
</section>
