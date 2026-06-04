<script lang="ts">
	// Album-art <img> with graceful fallback: walks artCandidates() on each load error
	// (proxied/cached → direct → retry), then shows a neutral placeholder instead of a broken-image
	// glyph. The parent provides size/shape via its container; this just fills it.
	import { artCandidates } from '$lib/plex/media';

	let {
		thumb,
		w,
		h = w,
		alt = ''
	}: { thumb?: string | null; w: number; h?: number; alt?: string } = $props();

	const cands = $derived(artCandidates(thumb, w, h));
	let idx = $state(0);
	let lastKey = '';

	// Reset to the first source whenever the artwork itself changes (not on a fallback step).
	$effect(() => {
		const key = cands[0] ?? '';
		if (key !== lastKey) {
			lastKey = key;
			idx = 0;
		}
	});

	const src = $derived(idx < cands.length ? cands[idx] : null);
</script>

{#if src}
	<img {src} {alt} loading="lazy" decoding="async" onerror={() => (idx += 1)} />
{:else}
	<div class="ph"></div>
{/if}

<style>
	img,
	.ph {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.ph {
		background: var(--surface);
	}
</style>
