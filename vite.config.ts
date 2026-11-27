import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import process from 'node:process';

// Pick test vs live Supabase settings from the branch being built.
// Cloudflare sets WORKERS_CI_BRANCH (Workers Builds) or CF_PAGES_BRANCH (Pages). `main` = live, anything else = test.
// In Cloudflare, set SUPABASE_URL_TEST / _LIVE and SUPABASE_PUBLISHABLE_KEY_TEST / _LIVE once as build variables.
const branch = process.env.WORKERS_CI_BRANCH ?? process.env.CF_PAGES_BRANCH ?? '';
const live = branch === 'main';
for (const key of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY']) {
	if (!process.env[key]) process.env[key] = process.env[`${key}_${live ? 'LIVE' : 'TEST'}`] ?? '';
}
process.env.APP_ENV ??= live ? 'live' : 'test';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Static build for Cloudflare Pages. Every route is prerendered as an
			// empty client-side shell (ssr = false in +layout.ts); the app runs in the browser.
			adapter: adapter({ pages: 'build', assets: 'build', precompress: false })
		})
	]
});
