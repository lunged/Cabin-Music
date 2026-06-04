<script lang="ts">
	import { page } from '$app/state';
	const key = $derived(page.params.key);
</script>

<section class="page">
	<h1>Playlist</h1>
	<p class="dim">Playlist detail + track list (#{key}) arrives in 2d.</p>
</section>
