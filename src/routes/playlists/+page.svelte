<script lang="ts">
	import { getPlaylists } from '$lib/plex/library';
	import VirtualGrid from '$lib/components/VirtualGrid.svelte';
	import type { PageResult } from '$lib/plex/types';

	const load = (start: number, size: number): Promise<PageResult> => getPlaylists({ start, size });
</script>

<section class="page">
	<h1>Playlists</h1>
	<VirtualGrid {load} />
</section>
