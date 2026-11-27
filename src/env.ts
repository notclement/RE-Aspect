import { defineEnvVars } from '@sveltejs/kit/env';

/**
 * Public, build-time environment variables (inlined into the browser bundle).
 * Set them in Cloudflare Pages → Settings → Variables, or in a local `.env` file.
 * Both are optional: without them the app runs in "preview mode" (no sign-in, data kept in this browser).
 *
 * NEVER put secret keys here — anything public is visible to every visitor.
 */
const optional = (value: string | undefined) => (value && value.trim() ? value.trim() : undefined);

export const variables = defineEnvVars({
	SUPABASE_URL: {
		public: true,
		static: true,
		schema: optional,
		description: 'Supabase project URL, e.g. https://xxxx.supabase.co'
	},
	SUPABASE_PUBLISHABLE_KEY: {
		public: true,
		static: true,
		schema: optional,
		description: 'Supabase publishable (sb_publishable_…) or legacy anon key. Safe for browsers.'
	},
	APP_ENV: {
		public: true,
		static: true,
		schema: (value) => (value === 'live' ? 'live' : 'test'),
		description: '"live" for production, anything else is treated as "test"'
	}
});
