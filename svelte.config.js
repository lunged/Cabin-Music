import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// Static SPA: every route is client-rendered (ssr=false in +layout.ts) and the
		// `fallback` shell boots the app for deep links. Cloudflare serves the shell for
		// unknown paths via `not_found_handling: single-page-application` in wrangler.jsonc.
		adapter: adapter({ fallback: 'index.html' }),
		// Nothing is prerendered — the SPA fetches everything from Plex at runtime.
		prerender: { entries: [] }
	}
};

export default config;
