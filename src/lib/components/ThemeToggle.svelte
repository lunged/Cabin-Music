<script lang="ts">
	// Persistent theme control (top-right). Tap cycles Auto → Light → Dark.
	import { theme, cycleTheme } from '$lib/stores/theme.svelte';

	const label = $derived(theme.choice.charAt(0).toUpperCase() + theme.choice.slice(1));
</script>

<button
	class="theme-toggle"
	onclick={cycleTheme}
	aria-label={`Theme: ${label}. Tap to change.`}
	title={`Theme: ${label}`}
>
	{#if theme.choice === 'light'}
		<!-- sun -->
		<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
		</svg>
	{:else if theme.choice === 'dark'}
		<!-- moon -->
		<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
		</svg>
	{:else}
		<!-- auto: half-filled circle -->
		<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
			<circle cx="12" cy="12" r="9" />
			<path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
		</svg>
	{/if}
	<span class="lbl">{label}</span>
</button>

<style>
	.theme-toggle {
		position: fixed;
		top: 16px;
		right: 16px;
		z-index: 50;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 48px;
		padding: 0 1rem 0 0.85rem;
		border-radius: 999px;
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 2px 14px var(--shadow);
		touch-action: manipulation;
	}
	.theme-toggle svg {
		flex: 0 0 auto;
	}
	.lbl {
		font-size: 0.95rem;
		font-weight: 600;
	}
</style>
