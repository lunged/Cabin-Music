<script lang="ts">
	// PIN pairing. Creates a (strong) PIN, shows a QR of the Plex auth deep-link, and polls until
	// authorized. The user scans with their phone (already signed in to Plex) — no typing needed.
	import { createPin, buildAuthUrl, pollPin, persistToken } from '$lib/plex/auth';
	import { bootSession } from '$lib/plex/discovery';
	import { setStatus } from '$lib/stores/session.svelte';
	import type { Pin } from '$lib/plex/types';

	type PairState = 'creating' | 'waiting' | 'expired' | 'error';

	let pairState = $state<PairState>('creating');
	let pin = $state<Pin | null>(null);
	let qrDataUrl = $state<string | null>(null);
	let errorMsg = $state<string | null>(null);
	let restartKey = $state(0);

	const authUrl = $derived(pin ? buildAuthUrl(pin.code) : '');

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
			qrDataUrl = null; // degrade gracefully to the tappable link
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
	<img class="logo" src="/android-chrome-192x192.png" alt="Cabin Music" width="96" height="96" />
	<h1>Pair with Plex</h1>

	{#if pairState === 'creating'}
		<div class="spinner" aria-hidden="true"></div>
		<p class="dim">Getting a pairing code…</p>
	{:else if pairState === 'error'}
		<p class="dim">Couldn't reach Plex to start pairing.</p>
		{#if errorMsg}<p class="errmsg">{errorMsg}</p>{/if}
		<button class="primary" onclick={retry}>Try again</button>
	{:else if pairState === 'expired'}
		<p class="dim">This pairing request expired.</p>
		<button class="primary" onclick={retry}>Get a new code</button>
	{:else if pin}
		<div class="grid">
			<div class="qrwrap">
				{#if qrDataUrl}
					<img class="qr" src={qrDataUrl} alt="Scan with your phone to sign in to Plex" width="320" height="320" />
				{:else}
					<div class="qr placeholder" aria-hidden="true"></div>
				{/if}
			</div>

			<div class="how">
				<p class="step"><strong>Scan with your phone</strong> to sign in to Plex and authorize Cabin&nbsp;Music.</p>
				<p class="or">Can't scan? <a href={authUrl} target="_blank" rel="noreferrer">Open the sign-in page here</a>.</p>
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
	.logo {
		width: 6rem;
		height: 6rem;
		border-radius: 1.375rem;
		display: block;
		box-shadow: 0 0.5rem 1.875rem var(--shadow);
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
		max-width: 62.5rem;
	}
	.qrwrap {
		flex: 0 0 auto;
	}
	.qr {
		width: clamp(13.75rem, 28vw, 21.25rem);
		height: clamp(13.75rem, 28vw, 21.25rem);
		border-radius: 1rem;
		background: #fff;
		display: block;
	}
	.qr.placeholder {
		background: var(--surface);
	}
	.how {
		flex: 1 1 20rem;
		max-width: 28.75rem;
		text-align: left;
	}
	.step {
		margin: 0 0 0.75rem;
		font-size: clamp(1.05rem, 1.8vw, 1.4rem);
		line-height: 1.45;
	}
	.how a {
		color: var(--text);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.or {
		margin: 0 0 1.25rem;
		color: var(--text-dim);
	}
	.waiting {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0;
		color: var(--text-dim);
	}
	.dot {
		width: 0.75rem;
		height: 0.75rem;
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
		max-width: 37.5rem;
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
		width: 3rem;
		height: 3rem;
		border-radius: 50%;
		border: 0.25rem solid var(--surface);
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
