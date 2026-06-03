<script lang="ts">
	// PIN pairing. Creates a code, shows it + a lazily-rendered QR, and polls until authorized.
	import { createPin, buildAuthUrl, pollPin, persistToken } from '$lib/plex/auth';
	import { bootSession } from '$lib/plex/discovery';
	import { PLEX_LINK_FALLBACK } from '$lib/plex/config';
	import { setStatus } from '$lib/stores/session.svelte';
	import type { Pin } from '$lib/plex/types';

	type PairState = 'creating' | 'waiting' | 'expired' | 'error';

	let pairState = $state<PairState>('creating');
	let pin = $state<Pin | null>(null);
	let qrDataUrl = $state<string | null>(null);
	let errorMsg = $state<string | null>(null);
	let restartKey = $state(0);

	const authUrl = $derived(pin ? buildAuthUrl(pin.code) : '');
	const linkLabel = PLEX_LINK_FALLBACK.replace(/^https?:\/\//, '');

	async function makeQr(url: string) {
		qrDataUrl = null;
		try {
			const mod: any = await import('qrcode');
			const QRCode = mod.default ?? mod;
			qrDataUrl = await QRCode.toDataURL(url, {
				width: 320,
				margin: 1,
				errorCorrectionLevel: 'M',
				color: { dark: '#16181d', light: '#ffffff' }
			});
		} catch {
			qrDataUrl = null; // degrade gracefully to code + link
		}
	}

	async function startPairing(signal: AbortSignal) {
		pairState = 'creating';
		errorMsg = null;
		qrDataUrl = null;
		try {
			const p = await createPin(signal);
			if (signal.aborted) return;
			pin = p;
			setStatus('pairing');
			pairState = 'waiting';
			void makeQr(buildAuthUrl(p.code));

			const result = await pollPin(p, signal, (token) => {
				persistToken(token);
				void bootSession(); // → discovering → connected (this screen unmounts)
			});
			if (result === 'expired') pairState = 'expired';
			// 'authorized': bootSession drives the status onward; 'aborted': we're unmounting.
		} catch (e) {
			if (signal.aborted) return;
			pairState = 'error';
			errorMsg = e instanceof Error ? e.message : String(e);
		}
	}

	$effect(() => {
		restartKey; // re-run when the user retries
		const ctrl = new AbortController();
		void startPairing(ctrl.signal);
		return () => ctrl.abort();
	});

	function retry() {
		restartKey++;
	}
</script>

<main class="pair">
	<h1>Pair with Plex</h1>

	{#if pairState === 'creating'}
		<div class="spinner" aria-hidden="true"></div>
		<p class="dim">Getting a pairing code…</p>
	{:else if pairState === 'error'}
		<p class="dim">Couldn't reach Plex to start pairing.</p>
		{#if errorMsg}<p class="errmsg">{errorMsg}</p>{/if}
		<button class="primary" onclick={retry}>Try again</button>
	{:else if pairState === 'expired'}
		<p class="dim">That code expired.</p>
		<button class="primary" onclick={retry}>Get a new code</button>
	{:else if pin}
		<div class="grid">
			<div class="qrwrap">
				{#if qrDataUrl}
					<img class="qr" src={qrDataUrl} alt="Scan with your phone to authorize" width="320" height="320" />
				{:else}
					<div class="qr placeholder" aria-hidden="true"></div>
				{/if}
			</div>

			<div class="how">
				<p class="step">
					On your phone, scan the code — or open
					<a href={authUrl} target="_blank" rel="noreferrer">app.plex.tv</a>.
				</p>
				<p class="or">or visit <strong>{linkLabel}</strong> and enter:</p>
				<div class="code" aria-label="Pairing code">{pin.code}</div>
				<p class="waiting"><span class="dot"></span> Waiting for you to authorize…</p>
			</div>
		</div>
	{/if}
</main>

<style>
	.pair {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.25rem;
		padding: 6vh 6vw;
		text-align: center;
	}
	h1 {
		margin: 0;
		font-size: clamp(2rem, 4.5vw, 3.25rem);
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.grid {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: clamp(1.5rem, 5vw, 4rem);
		max-width: 1000px;
	}
	.qrwrap {
		flex: 0 0 auto;
	}
	.qr {
		width: clamp(200px, 26vw, 320px);
		height: clamp(200px, 26vw, 320px);
		border-radius: 16px;
		background: #fff;
		display: block;
	}
	.qr.placeholder {
		background: var(--surface);
	}
	.how {
		flex: 1 1 320px;
		max-width: 460px;
		text-align: left;
	}
	.step {
		margin: 0 0 0.5rem;
		font-size: clamp(1rem, 1.6vw, 1.25rem);
	}
	.step a {
		color: var(--text);
		text-decoration: underline;
	}
	.or {
		margin: 0 0 0.5rem;
		color: var(--text-dim);
	}
	.code {
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		font-size: clamp(2.5rem, 7vw, 4.5rem);
		font-weight: 700;
		letter-spacing: 0.25em;
		padding: 0.5rem 0 0.75rem;
	}
	.waiting {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0;
		color: var(--text-dim);
	}
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--accent);
		animation: pulse 1.4s ease-in-out infinite;
	}
	.dim {
		color: var(--text-dim);
	}
	.errmsg {
		color: var(--accent);
		font-family: ui-monospace, Menlo, monospace;
		font-size: 0.9rem;
		max-width: 600px;
		word-break: break-word;
	}
	.primary {
		min-height: var(--tap-min);
		padding: 0 2rem;
		border-radius: var(--radius);
		background: var(--accent);
		color: #fff;
		font-size: 1.1rem;
		font-weight: 600;
	}
	.spinner {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		border: 4px solid var(--surface);
		border-top-color: var(--accent);
		animation: spin 0.9s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 0.35;
		}
		50% {
			opacity: 1;
		}
	}
</style>
