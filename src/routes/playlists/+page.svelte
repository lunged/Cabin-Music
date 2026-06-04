<script lang="ts">
	import { activeSection } from '$lib/stores/library.svelte';
	const section = $derived(activeSection());
</script>

<section class="page">
	<h1>Playlists</h1>
	<p class="dim">Playlists for <strong>{section?.title}</strong> arrive in 2d.</p>
</section>
