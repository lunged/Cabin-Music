<script lang="ts">
	// The in-car diagnostic channel (no DevTools). Opened from Settings → Diagnostics.
	import { debug, toggleDebug } from '$lib/stores/debug.svelte';
	import { session } from '$lib/stores/session.svelte';
	import { signOut } from '$lib/plex/auth';

	function maskedToken(t: string | null): string {
		if (!t) return '—';
		return t.length <= 4 ? '••••' : '••••' + t.slice(-4);
	}

	const origin = typeof location !== 'undefined' ? location.origin : '';

	// What the car's browser actually gives us — the numbers needed to calibrate Display size.
	function display(): string {
		const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
		return `${innerWidth}×${innerHeight} css px · screen ${screen.width}×${screen.height} · dpr ${devicePixelRatio} · rem ${rem}px`;
	}
</script>

{#if debug.visible}
	<div class="panel" role="dialog" aria-label="Cabin diagnostics">
		<header>
			<strong>Cabin · diagnostics</strong>
			<button class="close" onclick={toggleDebug}>Close</button>
		</header>

		<dl class="kv">
			<dt>status</dt>
			<dd>{session.status}{#if session.error} — {session.error.message}{/if}</dd>
			<dt>server</dt>
			<dd>{session.active?.serverName ?? '—'}</dd>
			<dt>connection</dt>
			<dd>{session.active ? `${session.active.connType} · ${session.active.baseUri}` : '—'}</dd>
			<dt>account</dt>
			<dd>{session.account?.username ?? session.account?.title ?? '—'}</dd>
			<dt>token</dt>
			<dd>{maskedToken(session.token)}</dd>
			<dt>origin</dt>
			<dd>{origin}</dd>
			<dt>display</dt>
			<dd>{display()}</dd>
			<dt>browser</dt>
			<dd>{navigator.userAgent}</dd>
		</dl>

		<div class="section">network · {debug.calls.length}</div>
		<ul class="log">
			{#each debug.calls as c (c.id)}
				<li class:err={!c.ok}>
					<span class="st">{c.status ?? (c.error ? 'ERR' : '…')}</span>
					<span class="ms">{c.ms ?? ''}ms</span>
					<span class="m">{c.method}</span>
					<span class="u">{c.url}</span>
					{#if c.error}<span class="e">{c.error}</span>{/if}
				</li>
			{:else}
				<li class="empty">no calls yet</li>
			{/each}
		</ul>

		{#if debug.events.length}
			<div class="section">events</div>
			<ul class="events">
				{#each debug.events as ev}
					<li>{ev.msg}</li>
				{/each}
			</ul>
		{/if}

		<button class="signout" onclick={signOut}>Sign out / re-pair</button>
	</div>
{/if}

<style>
	.panel {
		position: fixed;
		inset: 0 auto 0 0;
		width: min(35rem, 94vw);
		z-index: 9999;
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		padding: 1rem;
		background: var(--bg-elevated);
		color: var(--text);
		box-shadow: 0 0 2.5rem var(--shadow);
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		font-size: 0.8125rem;
		overflow: hidden;
		user-select: text;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.close,
	.signout {
		min-height: 2.75rem;
		padding: 0 1rem;
		border-radius: 0.625rem;
		background: var(--surface);
		color: var(--text);
		font: inherit;
	}
	.signout {
		margin-top: auto;
		background: var(--accent);
		font-weight: 600;
	}
	.kv {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 2px 0.75rem;
		margin: 0;
	}
	.kv dt {
		color: var(--text-dim);
	}
	.kv dd {
		margin: 0;
		word-break: break-all;
	}
	.section {
		margin-top: 0.25rem;
		color: var(--text-dim);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.6875rem;
	}
	.log {
		flex: 1 1 auto;
		min-height: 3.75rem;
		overflow-y: auto;
	}
	.log,
	.events {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.events {
		max-height: 7.5rem;
		overflow-y: auto;
	}
	.log li {
		display: grid;
		grid-template-columns: 2.75rem 3.5rem 2.625rem 1fr;
		gap: 0.375rem;
		align-items: baseline;
		padding: 3px 0;
		border-bottom: 1px solid var(--border);
	}
	.log li .e {
		grid-column: 1 / -1;
		color: var(--accent);
	}
	.log li.err .st {
		color: var(--accent);
	}
	.st {
		color: var(--ok);
	}
	.ms,
	.m {
		color: var(--text-dim);
	}
	.u {
		word-break: break-all;
	}
	.events li {
		padding: 2px 0;
		color: var(--text-dim);
	}
	.empty {
		color: var(--text-dim);
	}
</style>
