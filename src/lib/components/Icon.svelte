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
	{:else if name === 'play'}
		<path d="M7 5l13 7-13 7z" fill="currentColor" stroke="none" />
	{:else if name === 'pause'}
		<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
		<rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
	{:else if name === 'prev'}
		<rect x="5" y="5" width="2.6" height="14" rx="1" fill="currentColor" stroke="none" />
		<path d="M20 5l-10 7 10 7z" fill="currentColor" stroke="none" />
	{:else if name === 'next'}
		<rect x="16.4" y="5" width="2.6" height="14" rx="1" fill="currentColor" stroke="none" />
		<path d="M4 5l10 7-10 7z" fill="currentColor" stroke="none" />
	{:else if name === 'shuffle'}
		<polyline points="16 3 21 3 21 8" />
		<line x1="4" y1="20" x2="21" y2="3" />
		<polyline points="21 16 21 21 16 21" />
		<line x1="15" y1="15" x2="21" y2="21" />
		<line x1="4" y1="4" x2="9" y2="9" />
	{:else if name === 'repeat'}
		<polyline points="17 1 21 5 17 9" />
		<path d="M3 11V9a4 4 0 0 1 4-4h14" />
		<polyline points="7 23 3 19 7 15" />
		<path d="M21 13v2a4 4 0 0 1-4 4H3" />
	{:else if name === 'chevron-down'}
		<polyline points="6 9 12 15 18 9" />
	{:else if name === 'radio'}
		<circle cx="12" cy="13" r="2.4" />
		<path d="M4.9 7.8a10 10 0 0 1 14.2 0" />
		<path d="M7.8 10.6a6 6 0 0 1 8.4 0" />
		<path d="M12 15.4V20" />
	{:else if name === 'queue'}
		<line x1="4" y1="7" x2="20" y2="7" />
		<line x1="4" y1="12" x2="20" y2="12" />
		<line x1="4" y1="17" x2="13" y2="17" />
	{:else if name === 'plus'}
		<line x1="12" y1="5" x2="12" y2="19" />
		<line x1="5" y1="12" x2="19" y2="12" />
	{:else if name === 'x'}
		<line x1="6" y1="6" x2="18" y2="18" />
		<line x1="18" y1="6" x2="6" y2="18" />
	{:else if name === 'arrow-up'}
		<line x1="12" y1="19" x2="12" y2="5" />
		<polyline points="6 11 12 5 18 11" />
	{:else if name === 'arrow-down'}
		<line x1="12" y1="5" x2="12" y2="19" />
		<polyline points="6 13 12 19 18 13" />
	{:else if name === 'heart'}
		<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
	{:else if name === 'heart-filled'}
		<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" fill="currentColor" stroke="none" />
	{/if}
</svg>
