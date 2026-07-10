<script lang="ts">
	// The passphrase screen, shown before anything else when the Worker gate is enabled and this
	// browser isn't unlocked. Enter the passphrase once; a long-lived cookie remembers the car.
	import { submitPassphrase } from '$lib/stores/gate.svelte';

	let passphrase = $state('');
	let submitting = $state(false);
	let errored = $state(false);

	async function unlock(e: Event) {
		e.preventDefault();
		const value = passphrase.trim();
		if (!value || submitting) return;
		submitting = true;
		errored = false;
		try {
			const ok = await submitPassphrase(value);
			if (!ok) {
				errored = true;
				passphrase = '';
			}
			// On success the gate store clears `required`; the layout swaps this screen out and boots.
		} catch {
			errored = true;
		} finally {
			submitting = false;
		}
	}
</script>

<main class="gate">
	<form onsubmit={unlock}>
		<h1>Cabin Music</h1>
		<p class="msg">Enter the access passphrase to continue.</p>
		<input
			type="password"
			inputmode="text"
			autocomplete="current-password"
			placeholder="Passphrase"
			bind:value={passphrase}
			disabled={submitting}
			aria-label="Access passphrase"
			aria-invalid={errored}
		/>
		{#if errored}<p class="err" role="alert">Incorrect passphrase. Try again.</p>{/if}
		<button class="primary" type="submit" disabled={submitting || !passphrase.trim()}>
			{submitting ? 'Unlocking…' : 'Unlock'}
		</button>
	</form>
</main>

<style>
	.gate {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 6vh 8vw;
	}
	form {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 1rem;
		width: 100%;
		max-width: 460px;
		text-align: center;
	}
	h1 {
		margin: 0;
		font-size: clamp(2rem, 4.5vw, 3.25rem);
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.msg {
		margin: 0 0 0.5rem;
		font-size: clamp(1rem, 2vw, 1.35rem);
		color: var(--text-dim);
	}
	input {
		min-height: var(--tap-min);
		padding: 0 1.25rem;
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font-size: 1.25rem;
		text-align: center;
		border: 2px solid transparent;
	}
	input:focus {
		outline: none;
		border-color: var(--accent);
	}
	input[aria-invalid='true'] {
		border-color: var(--accent);
	}
	.err {
		margin: 0;
		color: var(--accent);
		font-size: 1rem;
	}
	.primary {
		min-height: var(--tap-min);
		padding: 0 2rem;
		border-radius: var(--radius);
		background: var(--accent);
		color: #fff;
		font-size: 1.15rem;
		font-weight: 600;
	}
	.primary:disabled {
		opacity: 0.55;
	}
</style>
