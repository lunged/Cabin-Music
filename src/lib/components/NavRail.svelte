<script lang="ts">
	import { page } from '$app/state';
	import Icon from './Icon.svelte';

	const items = [
		{ href: '/', label: 'Home', icon: 'home' },
		{ href: '/artists', label: 'Artists', icon: 'artist' },
		{ href: '/albums', label: 'Albums', icon: 'album' },
		{ href: '/playlists', label: 'Playlists', icon: 'playlist' },
		{ href: '/search', label: 'Search', icon: 'search' },
		{ href: '/settings', label: 'Settings', icon: 'settings' }
	];

	function isActive(href: string): boolean {
		const p = page.url.pathname;
		return href === '/' ? p === '/' : p.startsWith(href);
	}
</script>

<nav class="rail" aria-label="Primary">
	{#each items as it (it.href)}
		<a
			class="item"
			class:active={isActive(it.href)}
			href={it.href}
			aria-current={isActive(it.href) ? 'page' : undefined}
		>
			<Icon name={it.icon} />
			<span class="lbl">{it.label}</span>
		</a>
	{/each}
</nav>

<style>
	.rail {
		flex: 0 0 auto;
		width: clamp(96px, 11vw, 150px);
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 1rem 0.5rem;
		background: var(--bg-elevated);
		overflow-y: auto;
	}
	.item {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		min-height: var(--tap-min);
		padding: 0.5rem;
		border-radius: 14px;
		color: var(--text-dim);
		text-decoration: none;
		text-align: center;
	}
	.item.active {
		color: var(--accent);
		background: var(--surface);
	}
	.lbl {
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.01em;
	}
</style>
