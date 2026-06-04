<script lang="ts">
	import { page } from '$app/state';
	const key = $derived(page.params.key);
</script>

<section class="page">
	<h1>Album</h1>
	<p class="dim">Album detail + track list (#{key}) arrives in 2c.</p>
</section>
