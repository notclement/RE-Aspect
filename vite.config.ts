import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import process from 'node:process';

// Pick test vs live Supabase settings from the branch being built.
// Cloudflare sets WORKERS_CI_BRANCH (Workers Builds) or CF_PAGES_BRANCH (Pages). `main` = live, anything else = test.
// In Cloudflare, set SUPABASE_URL_TEST / _LIVE and SUPABASE_PUBLISHABLE_KEY_TEST / _LIVE once as build variables.
const branch = process.env.WORKERS_CI_BRANCH ?? process.env.CF_PAGES_BRANCH ?? '';
const live = branch === 'main';
// Publishable keys are designed to be public (data is protected by Row Level Security), so they can live here.
// Cloudflare build variables with the same names override these if ever needed.
const SUPABASE_PUBLIC = {
	TEST: {
		SUPABASE_URL: 'https://kyupdztsvwegaelrkyfd.supabase.co',
		SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_dyGHYJ-xqOkuEMaD6ZYCKw_-j4ZDmJy'
	},
	LIVE: {
		SUPABASE_URL: 'https://juyjbwdmmntoqegzhkyi.supabase.co',
		SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_loOMCARkP8_ehJ98SDXV3w_xIyIZQVY'
	}
} as const;
// REA_PREVIEW=1 builds a no-backend preview (local demos / screenshots).
for (const key of process.env.REA_PREVIEW === '1' ? [] : (['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'] as const)) {
	const env = live ? 'LIVE' : 'TEST';
	if (!process.env[key])
		process.env[key] = process.env[`${key}_${env}`] || SUPABASE_PUBLIC[env][key];
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
