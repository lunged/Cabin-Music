<script lang="ts">
	// First-run picker when the server has more than one music library.
	import { library, setActive } from '$lib/stores/library.svelte';
	import Icon from './Icon.svelte';
</script>

<main class="chooser">
	<h1>Choose a library</h1>
	<p class="dim">Which music library should Cabin open? You can switch later in Settings.</p>

	<div class="grid">
		{#each library.sections as s (s.key)}
			<button class="lib" onclick={() => setActive(s.key)}>
				<span class="ico"><Icon name="album" size={40} /></span>
				<span class="t">{s.title}</span>
			</button>
		{/each}
	</div>
</main>

<style>
	.chooser {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 6vh 8vw;
		text-align: center;
	}
	h1 {
		margin: 0;
		font-size: clamp(2rem, 4.5vw, 3rem);
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.dim {
		margin: 0 0 1.5rem;
		color: var(--text-dim);
	}
	.grid {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 1rem;
		max-width: 900px;
	}
	.lib {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		width: clamp(160px, 22vw, 220px);
		min-height: 160px;
		padding: 1.5rem;
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
	}
	.lib .ico {
		color: var(--text-dim);
	}
	.t {
		font-size: 1.15rem;
		font-weight: 600;
	}
</style>
