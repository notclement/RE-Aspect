import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

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
