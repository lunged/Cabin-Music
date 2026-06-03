// Pure client-rendered SPA: no SSR, nothing prerendered. The static `index.html`
// fallback (svelte.config.js) is the shell that boots the app for every route, so
// deep links work both under `vite preview` and behind Cloudflare's SPA fallback.
export const ssr = false;
export const prerender = false;
