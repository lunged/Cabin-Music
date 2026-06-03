import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	// The car's Chromium runs the official Plex SPA, so es2022 is safe (spec §2.4 / §10).
	// Drop to 'es2019' only if something misbehaves on the actual car.
	build: { target: 'es2022' }
});
