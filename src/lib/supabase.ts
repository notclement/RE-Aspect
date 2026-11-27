/**
 * Supabase client — loaded lazily so it never slows down the first paint.
 * If the env vars aren't set, the app runs in "preview mode" (no sign-in, local data only).
 */
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '$app/env/public';
import type { SupabaseClient } from '@supabase/supabase-js';

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

let client: Promise<SupabaseClient> | null = null;

export function getSupabase(): Promise<SupabaseClient> {
	if (!supabaseConfigured) {
		return Promise.reject(new Error('Supabase is not configured (preview mode).'));
	}
	client ??= import('@supabase/supabase-js').then(({ createClient }) =>
		createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
			auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
		})
	);
	return client;
}
