<script lang="ts">
	import { page } from '$app/state';
	const key = $derived(page.params.key);
</script>

<section class="page">
	<h1>Artist</h1>
	<p class="dim">Artist detail (#{key}) arrives in 2c.</p>
</section>
