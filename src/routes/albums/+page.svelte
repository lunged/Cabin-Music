<script lang="ts">
	import { activeSection } from '$lib/stores/library.svelte';
	import { getAll, TYPE } from '$lib/plex/library';
	import VirtualGrid from '$lib/components/VirtualGrid.svelte';
	import type { PageResult } from '$lib/plex/types';

	const section = $derived(activeSection());

	function makeLoad(sectionId: string) {
		return (start: number, size: number): Promise<PageResult> =>
			getAll(sectionId, { type: TYPE.album, start, size, sort: 'titleSort:asc' });
	}
</script>

<section class="page">
	<h1>Albums</h1>
	{#if section}
		{#key section.key}
			<VirtualGrid load={makeLoad(section.key)} />
		{/key}
	{/if}
</section>
