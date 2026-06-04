<script lang="ts">
	import { library, setActive } from '$lib/stores/library.svelte';
	import { theme, setTheme, type ThemeChoice } from '$lib/stores/theme.svelte';
	import {
		quality,
		setQuality,
		QUALITY_LABEL,
		QUALITY_KBPS,
		type Quality
	} from '$lib/stores/quality.svelte';
	import { invalidatePrefetch } from '$lib/stores/player.svelte';
	import { session } from '$lib/stores/session.svelte';
	import { signOut } from '$lib/plex/auth';

	const themes: ThemeChoice[] = ['auto', 'light', 'dark'];
	const qualities: Quality[] = ['original', 'high', 'medium', 'low'];

	function pickQuality(q: Quality) {
		setQuality(q);
		invalidatePrefetch(); // next track re-primes at the new quality
	}
</script>

<section class="page settings">
	<h1>Settings</h1>

	<div class="group">
		<h2>Library</h2>
		<p class="dim">Cabin shows one music library at a time.</p>
		<div class="chips">
			{#each library.sections as s (s.key)}
				<button class="chip" class:sel={s.key === library.activeId} onclick={() => setActive(s.key)}>
					{s.title}
				</button>
			{/each}
		</div>
	</div>

	<div class="group">
		<h2>Appearance</h2>
		<div class="seg">
			{#each themes as t (t)}
				<button class="seg-btn" class:sel={theme.choice === t} onclick={() => setTheme(t)}>{t}</button>
			{/each}
		</div>
	</div>

	<div class="group">
		<h2>Audio quality</h2>
		<p class="dim">
			Original streams your files untouched — lossless if your library is FLAC/ALAC. The lower
			settings transcode to MP3 to save data on cellular or relay connections.
		</p>
		<div class="seg">
			{#each qualities as q (q)}
				<button class="seg-btn" class:sel={quality.choice === q} onclick={() => pickQuality(q)}>
					{QUALITY_LABEL[q]}{#if q !== 'original'}&nbsp;· {QUALITY_KBPS[q]}k{/if}
				</button>
			{/each}
		</div>
	</div>

	<div class="group">
		<h2>Connection</h2>
		<dl class="info">
			<dt>Server</dt>
			<dd>{session.active?.serverName ?? '—'}</dd>
			<dt>Type</dt>
			<dd>{session.active?.connType ?? '—'}</dd>
			<dt>Account</dt>
			<dd>{session.account?.username ?? session.account?.title ?? '—'}</dd>
		</dl>
		<button class="danger" onclick={signOut}>Sign out</button>
	</div>
</section>

<style>
	.settings {
		max-width: 760px;
	}
	.group {
		margin-bottom: 2.5rem;
	}
	h2 {
		margin: 0 0 0.75rem;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-dim);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.chips,
	.seg {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.chip,
	.seg-btn {
		min-height: 56px;
		padding: 0 1.25rem;
		border-radius: 999px;
		background: var(--surface);
		color: var(--text);
		font-size: 1rem;
		font-weight: 600;
	}
	.seg-btn {
		text-transform: capitalize;
	}
	.chip.sel,
	.seg-btn.sel {
		background: var(--accent);
		color: #fff;
	}
	.info {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.4rem 1.5rem;
		margin: 0 0 1.5rem;
	}
	.info dt {
		color: var(--text-dim);
	}
	.info dd {
		margin: 0;
		word-break: break-word;
	}
	.danger {
		min-height: var(--tap-min);
		padding: 0 2rem;
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--accent);
		font-size: 1.05rem;
		font-weight: 600;
	}
	.dim {
		margin: 0 0 0.75rem;
	}
</style>
