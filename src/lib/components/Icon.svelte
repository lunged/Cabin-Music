<script lang="ts">
	let { name, size = 26 }: { name: string; size?: number } = $props();
</script>

<svg
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'home'}
		<path d="M3 11l9-8 9 8" />
		<path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
	{:else if name === 'artist'}
		<path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
		<path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
	{:else if name === 'album'}
		<circle cx="12" cy="12" r="9" />
		<circle cx="12" cy="12" r="2.4" />
	{:else if name === 'playlist'}
		<path d="M4 7h12M4 12h12M4 17h7" />
		<path d="M17 13.5l5 2.75-5 2.75z" fill="currentColor" stroke="none" />
	{:else if name === 'search'}
		<circle cx="11" cy="11" r="7" />
		<path d="M21 21l-4.3-4.3" />
	{:else if name === 'settings'}
		<line x1="4" y1="8" x2="20" y2="8" />
		<line x1="4" y1="16" x2="20" y2="16" />
		<circle cx="10" cy="8" r="2.6" fill="currentColor" stroke="none" />
		<circle cx="15" cy="16" r="2.6" fill="currentColor" stroke="none" />
	{/if}
</svg>
